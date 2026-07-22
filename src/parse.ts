import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import ini from "ini";

export type Format = "json" | "yaml" | "toml" | "ini" | "env";

export type Value = unknown;

const EXT_MAP: Record<string, Format> = {
  ".json": "json",
  ".json5": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".cfg": "ini",
  ".conf": "ini",
  ".env": "env",
  ".properties": "env",
};

/** Detect the format from a filename, falling back to content sniffing. */
export function detectFormat(filename: string | undefined, content: string): Format {
  if (filename) {
    const base = filename.toLowerCase();
    // .env, .env.local, .env.production ...
    if (base === ".env" || base.startsWith(".env.") || base.includes("/.env")) return "env";
    const ext = extname(base);
    if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  }
  return sniff(content);
}

/** Best-effort content sniffing when the extension is unknown. */
export function sniff(content: string): Format {
  const trimmed = content.trim();
  if (!trimmed) return "json";
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* not strict json, fall through */
    }
  }
  // env: lines of KEY=VALUE, no nesting, no leading spaces on keys
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const envLike = lines.length > 0 && lines.every((l) => /^[A-Za-z_][A-Za-z0-9_.]*\s*=/.test(l));
  const hasSection = lines.some((l) => /^\s*\[[^\]]+\]\s*$/.test(l));
  if (hasSection) return "ini";
  if (envLike) return "env";
  return "yaml"; // YAML is a superset of JSON and forgiving
}

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    // strip inline comments only for unquoted values
    if (!(val.startsWith('"') || val.startsWith("'"))) {
      const hash = val.indexOf(" #");
      if (hash !== -1) val = val.slice(0, hash);
      val = val.trim();
    } else {
      const quote = val[0];
      const end = val.indexOf(quote, 1);
      if (end !== -1) val = val.slice(1, end);
    }
    out[m[1]] = val;
  }
  return out;
}

export function parseContent(content: string, format: Format): Value {
  switch (format) {
    case "json":
      return JSON.parse(content);
    case "yaml":
      return parseYaml(content);
    case "toml":
      return parseToml(content);
    case "ini":
      return ini.parse(content);
    case "env":
      return parseEnv(content);
    default:
      throw new Error(`unsupported format: ${format as string}`);
  }
}
