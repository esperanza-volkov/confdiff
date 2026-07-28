#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import pc from "picocolors";
import { diff } from "./diff.js";
import { parseContent, keyRowsByColumn, detectFormat, type Format } from "./parse.js";
import { renderText, renderJson } from "./render.js";

const FORMATS: Format[] = ["json", "yaml", "toml", "ini", "env", "csv"];

interface Args {
  files: string[];
  format?: Format;
  formatA?: Format;
  formatB?: Format;
  ignore: string[];
  only: string[];
  arraySet: boolean;
  loose: boolean;
  csvKey?: string;
  json: boolean;
  quiet: boolean;
  color?: boolean;
  exitZero: boolean;
  help: boolean;
  version: boolean;
}

function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `${pc.bold("confdiff")} — semantic, format-aware diff for config & structured data

${pc.bold("USAGE")}
  confdiff <a> <b> [options]
  confdiff old.yaml new.yaml
  confdiff config.json config.yaml        # cross-format compare
  confdiff old.csv new.csv --csv-key id   # match CSV rows by a key column
  cat a.env | confdiff - b.env --format env

${pc.bold("OUTPUT")}
  Shows only what semantically changed: added (${pc.green("+")}), removed (${pc.red("-")}),
  changed (${pc.yellow("~")}). Key order, formatting, comments and quoting are ignored.

${pc.bold("OPTIONS")}
  -f, --format <fmt>     Force format for BOTH inputs (${FORMATS.join(", ")})
      --format-a <fmt>   Force format for the first input
      --format-b <fmt>   Force format for the second input
  -i, --ignore <glob>    Ignore paths matching glob (repeatable / comma-separated)
                         e.g. -i "metadata.*" -i "**.timestamp"
  -o, --only <glob>      Only compare paths matching glob (repeatable)
  -l, --loose            Loose scalars: "3"==3, "true"==true (great for .env/.ini)
      --csv-key <col>    For CSV/TSV: match rows by this column, not by position
      --array-set        Compare arrays as unordered sets (ignore element order)
      --json             Machine-readable JSON output (for CI / scripts)
  -q, --quiet            No output; communicate via exit code only
      --no-color         Disable ANSI color
      --exit-zero        Always exit 0 even when there are differences
  -h, --help             Show this help
  -v, --version          Show version

${pc.bold("EXIT CODES")}
  0  no semantic differences
  1  differences found
  2  usage or parse error

${pc.bold("GIT INTEGRATION")}
  Use as a git diff driver for config files. In .gitattributes:
    *.yaml diff=confdiff
  In git config:
    git config diff.confdiff.command 'confdiff --exit-zero'

Docs: https://github.com/esperanza-volkov/confdiff
`;

function fail(msg: string): never {
  process.stderr.write(pc.red(`error: `) + msg + "\n");
  process.stderr.write(`Run ${pc.bold("confdiff --help")} for usage.\n`);
  process.exit(2);
}

function asFormat(v: string): Format {
  if ((FORMATS as string[]).includes(v)) return v as Format;
  fail(`unknown format "${v}". Valid: ${FORMATS.join(", ")}`);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    files: [],
    ignore: [],
    only: [],
    arraySet: false,
    loose: false,
    json: false,
    quiet: false,
    exitZero: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`option ${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "-v":
      case "--version":
        a.version = true;
        break;
      case "-f":
      case "--format":
        a.format = asFormat(next());
        break;
      case "--format-a":
        a.formatA = asFormat(next());
        break;
      case "--format-b":
        a.formatB = asFormat(next());
        break;
      case "-i":
      case "--ignore":
        a.ignore.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "-o":
      case "--only":
        a.only.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "-l":
      case "--loose":
        a.loose = true;
        break;
      case "--csv-key":
        a.csvKey = next();
        break;
      case "--array-set":
        a.arraySet = true;
        break;
      case "--json":
        a.json = true;
        break;
      case "-q":
      case "--quiet":
        a.quiet = true;
        break;
      case "--color":
        a.color = true;
        break;
      case "--no-color":
        a.color = false;
        break;
      case "--exit-zero":
        a.exitZero = true;
        break;
      default:
        if (arg.startsWith("--") && arg.includes("=")) {
          const eq = arg.indexOf("=");
          argv.splice(i + 1, 0, arg.slice(eq + 1));
          argv[i] = arg.slice(0, eq);
          i--;
          break;
        }
        if (arg.startsWith("-") && arg !== "-") fail(`unknown option "${arg}"`);
        a.files.push(arg);
    }
  }
  return a;
}

function readInput(file: string): string {
  if (file === "-") return readFileSync(0, "utf8");
  try {
    return readFileSync(file, "utf8");
  } catch (e) {
    fail(`cannot read "${file}": ${(e as Error).message}`);
  }
}

export function main(argv = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  if (args.version) {
    process.stdout.write(getVersion() + "\n");
    return;
  }
  if (args.help || args.files.length === 0) {
    process.stdout.write(HELP);
    if (args.files.length === 0 && !args.help) process.exit(2);
    return;
  }
  if (args.files.length !== 2) fail(`expected exactly 2 inputs, got ${args.files.length}`);

  const [fileA, fileB] = args.files;
  const rawA = readInput(fileA);
  const rawB = readInput(fileB);

  const fmtA = args.formatA ?? args.format ?? detectFormat(fileA === "-" ? undefined : basename(fileA), rawA);
  const fmtB = args.formatB ?? args.format ?? detectFormat(fileB === "-" ? undefined : basename(fileB), rawB);

  let valA: unknown;
  let valB: unknown;
  try {
    valA = parseContent(rawA, fmtA);
  } catch (e) {
    fail(`failed to parse "${fileA}" as ${fmtA}: ${(e as Error).message}`);
  }
  try {
    valB = parseContent(rawB, fmtB);
  } catch (e) {
    fail(`failed to parse "${fileB}" as ${fmtB}: ${(e as Error).message}`);
  }

  if (args.csvKey) {
    try {
      if (fmtA === "csv") valA = keyRowsByColumn(valA as Record<string, string>[], args.csvKey);
      if (fmtB === "csv") valB = keyRowsByColumn(valB as Record<string, string>[], args.csvKey);
    } catch (e) {
      fail((e as Error).message);
    }
  }

  const changes = diff(valA, valB, {
    ignore: args.ignore,
    only: args.only,
    arraySet: args.arraySet,
    loose: args.loose,
  });

  if (!args.quiet) {
    if (args.json) {
      process.stdout.write(renderJson(changes) + "\n");
    } else {
      const color = args.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);
      process.stdout.write(renderText(changes, { color: !!color }) + "\n");
    }
  }

  process.exit(args.exitZero ? 0 : changes.length > 0 ? 1 : 0);
}

main();
