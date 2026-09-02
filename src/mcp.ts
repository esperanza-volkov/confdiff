/**
 * confdiff MCP server.
 *
 * Exposes confdiff's semantic, format-aware config diffing as Model Context
 * Protocol tools so an AI agent (Claude Desktop, Cursor, Cline, etc.) can
 * compare JSON / YAML / TOML / INI / .env / XML / CSV configs by MEANING —
 * ignoring key order and formatting noise, optionally redacting secret values
 * so plaintext passwords/tokens never enter the model's context.
 *
 * Two tools:
 *   - diff_configs        diff two config strings you already have in context
 *   - diff_config_files   read two files from disk and diff them
 *
 * Built and maintained by Esperanza Volkov, an autonomous AI agent.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { compare, type CompareOptions, type Format } from "./index.js";
import { renderText, renderJson } from "./render.js";
import { makeRedactMatcher } from "./redact.js";

const FORMATS = ["json", "jsonc", "yaml", "toml", "ini", "env", "xml", "csv"] as const;

// Shared option schema shape reused by both tools.
const optionShape = {
  formatA: z
    .enum(FORMATS)
    .optional()
    .describe("Force the format of the first input (else inferred from filename/content)."),
  formatB: z
    .enum(FORMATS)
    .optional()
    .describe("Force the format of the second input."),
  ignore: z
    .array(z.string())
    .optional()
    .describe("Path globs to ignore, dot notation (e.g. 'metadata.creationTimestamp', 'spec.**')."),
  only: z
    .array(z.string())
    .optional()
    .describe("If set, ONLY paths matching these globs are compared."),
  arrayKey: z
    .array(z.string())
    .optional()
    .describe(
      "Match arrays of objects by a field's value instead of by position, so reordering a list " +
        "(e.g. a k8s env:/containers: block) is not reported. Bare field name ('name') or scoped 'pathGlob=field'.",
    ),
  arraySet: z
    .boolean()
    .optional()
    .describe("Compare arrays as unordered multisets instead of by index."),
  loose: z
    .boolean()
    .optional()
    .describe("Loose scalar comparison: coerce string<->number<->boolean so \"3\" == 3."),
  redact: z
    .boolean()
    .optional()
    .describe(
      "Mask secret VALUES (passwords/tokens/keys, detected by key name) as a stable non-reversible " +
        "fingerprint, so plaintext secrets never enter your context while drift is still visible.",
    ),
  redactEntropy: z
    .boolean()
    .optional()
    .describe("With redact: also mask values that LOOK like secrets (long, high-entropy) under any key."),
};

interface RawOpts {
  formatA?: string;
  formatB?: string;
  ignore?: string[];
  only?: string[];
  arrayKey?: string[];
  arraySet?: boolean;
  loose?: boolean;
  redact?: boolean;
  redactEntropy?: boolean;
}

function buildCompareOptions(o: RawOpts, filenameA?: string, filenameB?: string): CompareOptions {
  const opts: CompareOptions = {
    formatA: o.formatA as Format | undefined,
    formatB: o.formatB as Format | undefined,
    filenameA,
    filenameB,
    ignore: o.ignore,
    only: o.only,
    arrayKey: o.arrayKey,
    arraySet: o.arraySet,
    loose: o.loose,
  };
  return opts;
}

function runDiff(a: string, b: string, o: RawOpts, filenameA?: string, filenameB?: string) {
  const opts = buildCompareOptions(o, filenameA, filenameB);
  const changes = compare(a, b, opts);
  const redactMatcher =
    o.redact || o.redactEntropy ? makeRedactMatcher(true, [], !!o.redactEntropy) : undefined;
  const text = renderText(changes, { color: false, redact: redactMatcher });
  const json = renderJson(changes, { redact: redactMatcher });
  const summary = changes.length === 0 ? "No semantic differences." : `${changes.length} change(s).`;
  const human = changes.length === 0 ? summary : `${summary}\n${text}`;
  return {
    content: [{ type: "text" as const, text: human }],
    structuredContent: JSON.parse(json),
  };
}

export function buildServer(version: string): McpServer {
  const server = new McpServer({ name: "confdiff", version });

  server.registerTool(
    "diff_configs",
    {
      title: "Diff two config strings semantically",
      description:
        "Compare two configuration strings (JSON/JSONC/YAML/TOML/INI/.env/XML/CSV) by MEANING, " +
        "ignoring key order and formatting noise. Cross-format is supported (diff a JSON against " +
        "its YAML equivalent). Returns a compact list of real changes plus structured JSON. " +
        "Set redact=true to mask secret values so plaintext never enters your context.",
      inputSchema: {
        a: z.string().describe("First config as a string."),
        b: z.string().describe("Second config as a string."),
        ...optionShape,
      },
    },
    async ({ a, b, ...o }) => {
      try {
        return runDiff(a, b, o as RawOpts);
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "diff_config_files",
    {
      title: "Diff two config files on disk semantically",
      description:
        "Read two config files from disk by path and diff them by MEANING (format inferred from the " +
        "file extension unless overridden). Use this to check whether an edit changed anything real, " +
        "compare a before/after, or verify a format migration. Set redact=true to keep secrets out of context.",
      inputSchema: {
        pathA: z.string().describe("Path to the first config file."),
        pathB: z.string().describe("Path to the second config file."),
        ...optionShape,
      },
    },
    async ({ pathA, pathB, ...o }) => {
      try {
        const a = readFileSync(pathA, "utf8");
        const b = readFileSync(pathB, "utf8");
        return runDiff(a, b, o as RawOpts, pathA, pathB);
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

// Injected at bundle time by scripts/build-mcp.mjs (esbuild --define).
declare const __CONFDIFF_VERSION__: string;
const VERSION = typeof __CONFDIFF_VERSION__ === "string" ? __CONFDIFF_VERSION__ : "0.0.0";

async function main(): Promise<void> {
  const server = buildServer(VERSION);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when run as the entrypoint (not when imported by tests).
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /mcp(\.js|\.cjs|\.ts)?$/.test(process.argv[1] ?? "");
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
