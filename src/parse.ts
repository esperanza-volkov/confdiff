import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import ini from "ini";

export type Format = "json" | "yaml" | "toml" | "ini" | "env" | "csv";

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
  ".csv": "csv",
  ".tsv": "csv",
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

/**
 * Parse CSV/TSV into an array of row objects keyed by the header row.
 *
 * Zero-config: the delimiter (`,` `\t` `;` `|`) is auto-detected from the header
 * line unless `delimiter` is given. Handles RFC 4180 quoting — quoted fields may
 * contain the delimiter, newlines, and `""`-escaped quotes. All cell values are
 * strings, so pair with `--loose` to compare `"80"` against `80`, or with
 * `--csv-key <col>` (in the CLI) to match rows by a key column instead of by
 * position.
 */
export function parseCsv(content: string, delimiter?: string): Record<string, string>[] {
  const src = content.replace(/^\uFEFF/, "");
  const delim = delimiter ?? sniffDelimiter(src);
  const rows = tokenizeCsv(src, delim);
  // drop trailing fully-empty rows produced by a final newline
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (rows.length === 0) return [];
  const header = rows[0];
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cells[c] ?? "";
    }
    out.push(obj);
  }
  return out;
}

function sniffDelimiter(content: string): string {
  const firstLine = content.slice(0, content.search(/\r?\n/) === -1 ? content.length : content.search(/\r?\n/));
  const candidates = ["\t", ";", "|", ","];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** RFC 4180-ish tokenizer supporting quoted fields with embedded delimiters/newlines. */
function tokenizeCsv(content: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = content.length;
  while (i < n) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (ch === "\r" && content[i + 1] === "\n") i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush trailing field/row (no final newline)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Re-key an array of row objects into an object keyed by `column`, so rows are
 * matched by that key rather than by position. Throws on missing column or
 * duplicate keys (which would silently drop rows).
 */
export function keyRowsByColumn(
  rows: Record<string, string>[],
  column: string,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Object.prototype.hasOwnProperty.call(row, column)) {
      throw new Error(`csv key column "${column}" not found in header`);
    }
    const key = row[column];
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new Error(`duplicate csv key "${key}" in column "${column}"; use positional compare (drop --csv-key)`);
    }
    out[key] = row;
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
    case "csv":
      return parseCsv(content);
    default:
      throw new Error(`unsupported format: ${format as string}`);
  }
}
