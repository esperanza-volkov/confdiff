import { extname } from "node:path";
import { parse as parseYaml, parseAllDocuments } from "yaml";
import { parse as parseToml } from "smol-toml";

/**
 * Integers outside JS's safe range (|n| > 2^53-1) lose precision when parsed
 * into a plain `number` — e.g. Discord/Twitter "snowflake" IDs or 64-bit
 * counters. That silently makes two *different* IDs compare EQUAL, the worst
 * failure mode for a diff tool. We preserve such integers losslessly as
 * `BigInt` (JSON via a reviver, YAML/TOML via their bigint options) and
 * normalise safe-range bigints back to plain numbers so ordinary values keep
 * their usual type and cross-format compares still line up (a `1` is a `1`).
 */
function normalizeBigInts(value: Value): Value {
  if (typeof value === "bigint") {
    return isSafeBig(value) ? Number(value) : value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = normalizeBigInts(value[i]);
    return value;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) obj[k] = normalizeBigInts(obj[k]);
    return obj;
  }
  return value;
}

function isSafeBig(n: bigint): boolean {
  return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER);
}

/**
 * Strip `//` line and block comments and trailing commas from a JSON document
 * so JSON-with-comments config files parse cleanly: `tsconfig.json`, VS Code
 * `settings.json`, `devcontainer.json`, `.eslintrc.json`, `.babelrc`, and any
 * `.jsonc`/`.json5` file that only uses comments + trailing commas. Comments and
 * trailing commas are never valid in strict JSON, so this is a NO-OP on any
 * conforming JSON document — behaviour is byte-for-byte unchanged for ordinary
 * input. String contents (including `//`, `/*` and commas inside double-quoted
 * strings) are preserved. Comments are replaced with equal-length whitespace and
 * a trailing comma with a single space, so parse-error line/column numbers still
 * line up with the source.
 */
export function stripJsonc(text: string): string {
  const out: string[] = [];
  const n = text.length;
  let inString = false;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inString) {
      out.push(c);
      if (c === "\\" && i + 1 < n) {
        out.push(text[i + 1]);
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out.push(c);
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      out.push("  ");
      while (i < n && text[i] !== "\n") {
        out.push(text[i] === "\t" ? "\t" : " ");
        i++;
      }
      if (i < n) out.push("\n"); // keep the newline
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      out.push("  ");
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        out.push(text[i] === "\n" ? "\n" : text[i] === "\t" ? "\t" : " ");
        i++;
      }
      if (i + 1 < n) {
        out.push("  ");
        i++; // the loop's i++ consumes the second char
      }
      continue;
    }
    out.push(c);
  }
  // Remove trailing commas: a comma whose next non-whitespace char is } or ].
  const s = out;
  let inStr2 = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr2) {
      if (c === "\\") i++;
      else if (c === '"') inStr2 = false;
      continue;
    }
    if (c === '"') {
      inStr2 = true;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j < s.length && (s[j] === "}" || s[j] === "]")) s[i] = " ";
    }
  }
  return s.join("");
}

/**
 * Parse JSON while preserving integers that exceed JS's safe range as BigInt.
 * The fast path (the vast majority of documents) is plain `JSON.parse`, so
 * behaviour is byte-for-byte unchanged. Only when the text contains a run of 16+
 * digits — the shortest that can exceed 2^53-1 — do we re-parse losslessly via
 * the (already-bundled, battle-tested) YAML reader, which is a strict superset
 * of JSON and supports `intAsBigInt`. `normalizeBigInts` then demotes any
 * safe-range bigints back to plain numbers, so ordinary values are untouched.
 * This works on every supported Node version (unlike the Node 21+ JSON reviver
 * `context.source`) and in the browser playground. JSON-with-comments (`.jsonc`
 * / tsconfig-style) input is tolerated via `stripJsonc` first.
 */
function parseJsonContent(content: string): Value {
  const text = stripJsonc(content);
  if (!/\d{16,}/.test(text)) return JSON.parse(text);
  // Validate as JSON first so malformed input still yields a JSON-style error.
  JSON.parse(text);
  return normalizeBigInts(parseYaml(text, { intAsBigInt: true, uniqueKeys: false }));
}
import ini from "ini";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type Format = "json" | "yaml" | "toml" | "ini" | "env" | "properties" | "csv" | "xml";

export type Value = unknown;

const EXT_MAP: Record<string, Format> = {
  ".json": "json",
  ".jsonc": "json",
  ".json5": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".cfg": "ini",
  ".conf": "ini",
  ".env": "env",
  ".properties": "properties",
  ".csv": "csv",
  ".tsv": "csv",
  ".xml": "xml",
  ".xhtml": "xml",
  ".svg": "xml",
  ".plist": "xml",
  ".xsd": "xml",
};

/** Extensions confdiff recognizes as structured-config files (for directory diffs). */
export const KNOWN_EXTENSIONS: readonly string[] = Object.keys(EXT_MAP);

/** True if a bare filename looks like a config file confdiff can parse by extension. */
export function isConfigFilename(name: string): boolean {
  const base = name.toLowerCase();
  if (base === ".env" || base.startsWith(".env.")) return true;
  const ext = extname(base);
  return !!(ext && EXT_MAP[ext]);
}

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
  if (trimmed[0] === "<") return "xml";
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    try {
      JSON.parse(stripJsonc(trimmed));
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
 * Parse a Java `.properties` file (as consumed by `java.util.Properties.load`).
 *
 * Unlike `.env`, a properties file accepts THREE key/value separators — `=`,
 * `:`, or whitespace — plus `#`/`!` comments, backslash line continuations, and
 * `\uXXXX`/`\t`/`\:` style escapes. Treating `.properties` as `.env` (only `=`)
 * silently dropped every `key: value` or `key value` line, so comparing two real
 * Spring/log4j property files produced wrong, incomplete diffs. This parser
 * handles the full format so those lines are compared instead of vanishing.
 */
export function parseProperties(content: string): Record<string, string> {
  const out: Record<string, string> = {};

  // 1. Split into logical lines, honouring backslash continuation. A line
  //    continues onto the next when it ends with an ODD number of backslashes.
  const physical = content.split(/\r\n|\r|\n/);
  const logical: string[] = [];
  let buf: string | null = null;
  for (const raw of physical) {
    // Leading whitespace of a *continuation* line is stripped; of a fresh line
    // it is stripped when we locate the key below. Strip here for both.
    const line: string = buf === null ? raw : raw.replace(/^[ \t\f]+/, "");
    const joined: string = buf === null ? line : buf + line;
    // Count trailing backslashes to decide if THIS logical line continues.
    let bs = 0;
    for (let i = joined.length - 1; i >= 0 && joined[i] === "\\"; i--) bs++;
    if (bs % 2 === 1) {
      buf = joined.slice(0, -1); // drop the escaping backslash, keep accumulating
    } else {
      logical.push(joined);
      buf = null;
    }
  }
  if (buf !== null) logical.push(buf);

  for (const logLine of logical) {
    // 2. Skip leading whitespace, then blank/comment lines (# or !).
    const s = logLine.replace(/^[ \t\f]+/, "");
    if (s === "" || s[0] === "#" || s[0] === "!") continue;

    // 3. Find the key: characters up to the first UNESCAPED separator, which is
    //    whitespace, `=`, or `:`.
    let i = 0;
    let keyEnd = s.length;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "\\") {
        i++; // skip the escaped char (it belongs to the key)
        continue;
      }
      if (c === " " || c === "\t" || c === "\f" || c === "=" || c === ":") {
        keyEnd = i;
        break;
      }
    }
    const rawKey = s.slice(0, keyEnd);

    // 4. Skip whitespace after the key; then an optional `=`/`:`; then more ws.
    let j = keyEnd;
    while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\f")) j++;
    if (j < s.length && (s[j] === "=" || s[j] === ":")) {
      j++;
      while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\f")) j++;
    }
    const rawVal = s.slice(j);

    out[unescapeProperties(rawKey)] = unescapeProperties(rawVal);
  }
  return out;
}

/** Process `\uXXXX`, `\t\n\r\f`, and `\<char>` escapes in a properties token. */
function unescapeProperties(str: string): string {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = str[++i];
    if (n === undefined) break;
    switch (n) {
      case "t":
        out += "\t";
        break;
      case "n":
        out += "\n";
        break;
      case "r":
        out += "\r";
        break;
      case "f":
        out += "\f";
        break;
      case "u": {
        const hex = str.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += "u";
        }
        break;
      }
      default:
        // \=  \:  \  \\  and any other -> the literal following character
        out += n;
    }
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

/**
 * Parse XML into a plain nested object so it can be diffed semantically —
 * element/attribute order and insignificant whitespace are ignored, and only
 * structural or value changes are reported.
 *
 * Attributes are keyed with an `@_` prefix (`@_id`), an element's own text
 * becomes `#text`, and repeated child elements become arrays. Scalar text and
 * attribute values are type-coerced (so `<port>80</port>` compares equal to a
 * JSON `"port": 80`); use `--loose` if you'd rather not coerce.
 */
export function parseXml(content: string): Value {
  const valid = XMLValidator.validate(content);
  if (valid !== true) {
    const err = (valid as { err?: { msg?: string; line?: number } }).err;
    const where = err?.line ? ` (line ${err.line})` : "";
    throw new Error(`invalid XML${where}: ${err?.msg ?? "malformed document"}`);
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: true,
    parseAttributeValue: true,
    trimValues: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    processEntities: true,
  });
  return parser.parse(content);
}

/**
 * Parse YAML, transparently supporting multi-document streams (`---`
 * separators) as used by Kubernetes manifests, `kubectl get -o yaml`, and
 * Helm renders. A single-document stream returns the document directly (so
 * existing behaviour and cross-format compares are unchanged); a multi-document
 * stream returns an array of documents (positional). Empty documents (e.g. a
 * trailing `---`) are dropped so cosmetic separators don't create phantom diffs.
 */
const YAML_OPTS = { merge: true, intAsBigInt: true } as const;

function parseYamlContent(content: string): Value {
  const docs = parseAllDocuments(content, YAML_OPTS);
  if (docs.length <= 1) {
    // Preserve exact single-doc semantics (including empty/blank input).
    return parseYaml(content, YAML_OPTS);
  }
  const values: Value[] = [];
  for (const doc of docs) {
    if (doc.errors.length > 0) {
      throw doc.errors[0];
    }
    const js = doc.toJS();
    // Skip truly empty documents (null/undefined from bare `---`).
    if (js === null || js === undefined) continue;
    values.push(js);
  }
  // Collapse to single-document semantics when only zero/one real document
  // remains after dropping empties, so cosmetic `---` separators never change
  // the diff shape.
  if (values.length === 0) return parseYaml(content);
  if (values.length === 1) return values[0];
  return values;
}

export function parseContent(content: string, format: Format): Value {
  // An empty or whitespace-only input is treated as an empty document, not a
  // parse error. This mirrors how a git diff driver sees a newly-added or
  // just-emptied config file (old side empty), so `confdiff empty.json full.json`
  // cleanly reports every key as added instead of crashing. Behaviour is now
  // consistent across every format (previously empty JSON threw).
  if (content.trim() === "") {
    return format === "csv" ? [] : {};
  }
  switch (format) {
    case "json":
      return parseJsonContent(content);
    case "yaml":
      return normalizeBigInts(parseYamlContent(content));
    case "toml":
      return normalizeBigInts(parseToml(content, { integersAsBigInt: true }) as Value);
    case "ini":
      return ini.parse(content);
    case "env":
      return parseEnv(content);
    case "properties":
      return parseProperties(content);
    case "csv":
      return parseCsv(content);
    case "xml":
      return parseXml(content);
    default:
      throw new Error(`unsupported format: ${format as string}`);
  }
}
