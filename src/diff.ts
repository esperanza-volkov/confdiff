/** A keyed-array selector segment, e.g. `containers[name=web]`. Produced when
 * `--array-key` matches list-of-object elements by a field value instead of by
 * positional index, so reordering a list doesn't create phantom diffs. */
export interface KeySeg {
  key: string;
  value: string | number | boolean | null;
}

export type PathSeg = string | number | KeySeg;
export type Path = PathSeg[];

export function isKeySeg(s: PathSeg): s is KeySeg {
  return typeof s === "object" && s !== null && "key" in s && "value" in s;
}

/** Canonical string form of a single path segment (used for glob matching and
 * pointers): keyed segments render as `key=value`, everything else as-is. */
export function segStr(s: PathSeg): string {
  if (isKeySeg(s)) return `${s.key}=${String(s.value)}`;
  return String(s);
}

export type ChangeKind = "add" | "remove" | "change";

export interface Change {
  path: Path;
  kind: ChangeKind;
  /** present for "remove" and "change" */
  oldValue?: unknown;
  /** present for "add" and "change" */
  newValue?: unknown;
  /** true when a "change" also changed the JSON type (e.g. number -> string) */
  typeChanged?: boolean;
}

export interface DiffOptions {
  /** Path glob patterns to ignore (dot notation, `*` = one segment, `**` = any depth). */
  ignore?: string[];
  /** If set, only paths matching one of these globs are compared. */
  only?: string[];
  /** Compare arrays as unordered multisets instead of by index. */
  arraySet?: boolean;
  /**
   * Match arrays of objects by a key field's value instead of by position, so
   * reordering a list (e.g. a k8s `env:` or `containers:` block) produces no
   * noise and each element is diffed against its same-keyed counterpart.
   * Each entry is a bare field name (`name`) applied wherever every element is
   * an object carrying that field, or a scoped `pathGlob=field` mapping. The
   * first applicable entry wins; if a field's values aren't unique on a side,
   * that array falls back to indexed comparison.
   */
  arrayKey?: string[];
  /**
   * Loose scalar comparison: coerce string<->number<->boolean so that
   * "3" == 3 and "true" == true. Handy for INI/.env where all values are strings.
   */
  loose?: boolean;
}

export function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof Date) return "date";
  if (typeof v === "object" && v !== null && !isPlainObject(v)) return "scalar";
  return typeof v;
}

/**
 * Only plain objects (and arrays) are treated as containers to recurse into.
 * Exotic objects — Date (from TOML/YAML), RegExp, class instances — are compared
 * as opaque scalars by value, so a date change isn't silently swallowed.
 */
function isPlainObject(v: unknown): boolean {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Comparable representation of a non-plain, non-array value (Date, etc.). */
function scalarValue(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v !== null && typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v;
}

function pathToString(path: Path): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (isKeySeg(seg)) out += `[${seg.key}=${String(seg.value)}]`;
    else if (out === "") out = seg;
    else out += `.${seg}`;
  }
  return out;
}

function segMatch(pat: string, seg: string): boolean {
  if (pat === "*" || pat === "**") return true;
  if (pat === seg) return true;
  // Support intra-segment wildcards: `*` = any run of chars, `?` = one char
  // (e.g. `*_SECRET`, `db_*`, `item?`). Literal chars are regex-escaped.
  if (!pat.includes("*") && !pat.includes("?")) return false;
  const re =
    "^" +
    pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
    "$";
  return new RegExp(re).test(seg);
}

/**
 * Split a glob pattern into segment tokens, understanding BOTH dot notation
 * and the bracket notation the tool itself prints for array indices. So
 * `items[0].name`, `items[*].name` and `items.0.name` all tokenize to the same
 * segment list. This is what makes a printed path (e.g. `items[0].name`)
 * round-trippable straight back into --ignore/--only. Inside `[...]` the content
 * is taken verbatim as one token (`0`, `*`, `**`), so an index is never split.
 */
function splitPattern(pattern: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === ".") {
      if (cur !== "") tokens.push(cur);
      cur = "";
    } else if (ch === "[") {
      if (cur !== "") tokens.push(cur);
      cur = "";
      let inner = "";
      let j = i + 1;
      while (j < pattern.length && pattern[j] !== "]") inner += pattern[j++];
      tokens.push(inner);
      i = j; // skip past the closing "]"
    } else {
      cur += ch;
    }
  }
  if (cur !== "") tokens.push(cur);
  return tokens;
}

/** Match a path against a glob pattern. `*` = one segment, `**` = zero-or-more segments; within a segment `*`/`?` are wildcards (e.g. `*_SECRET`). Array indices may be written `foo[0]`/`foo[*]` or `foo.0`/`foo.*`. */
function matchGlob(pattern: string, path: Path): boolean {
  const pats = splitPattern(pattern);
  const segs = path.map(segStr);
  // simple recursive matcher supporting **
  const rec = (pi: number, si: number): boolean => {
    if (pi === pats.length) return si === segs.length;
    if (pats[pi] === "**") {
      // ** matches any number of segments
      for (let k = si; k <= segs.length; k++) {
        if (rec(pi + 1, k)) return true;
      }
      return false;
    }
    if (si >= segs.length) return false;
    // Standard one-token-per-segment match (preserves intra-segment wildcards).
    if (segMatch(pats[pi], segs[si]) && rec(pi + 1, si + 1)) return true;
    // Dotted-key support: a single path segment may itself contain dots (e.g.
    // the k8s annotation key `app.kubernetes.io/name`, or log4j-style
    // properties). Such a key is *rendered* with embedded dots, so let a run of
    // consecutive literal pattern tokens joined by "." match one segment. This
    // makes the tool's own printed path round-trippable back into --ignore/--only.
    // Only literal tokens are joined, so wildcard semantics are unchanged.
    if (!hasWildcard(pats[pi])) {
      let joined = pats[pi];
      for (let j = pi + 1; j < pats.length; j++) {
        if (pats[j] === "**" || hasWildcard(pats[j])) break;
        joined += "." + pats[j];
        if (joined === segs[si] && rec(j + 1, si + 1)) return true;
      }
    }
    return false;
  };
  return rec(0, 0);
}

function hasWildcard(tok: string): boolean {
  return tok.includes("*") || tok.includes("?");
}

/**
 * Public helper: does `path` match ANY of the given glob `patterns`? Uses the
 * same matcher as --ignore/--only (dot + bracket notation, `*`/`**`/`?`, dotted
 * keys). Also treats a bare key-name token (no separators) as matching that key
 * at any depth, so `--redact password` masks `db.password` and `password`.
 */
export function matchAnyGlob(path: Path, patterns: string[]): boolean {
  for (const p of patterns) {
    if (matchGlob(p, path)) return true;
    // bare key name -> match that last segment anywhere
    if (!p.includes(".") && !p.includes("[") && path.length > 0) {
      if (segMatch(p, segStr(path[path.length - 1]))) return true;
    }
  }
  return false;
}

function pathSelected(path: Path, opts: DiffOptions): boolean {
  const s = pathToString(path);
  if (opts.ignore && opts.ignore.some((p) => matchGlob(p, path))) return false;
  if (opts.only && opts.only.length > 0) {
    // keep a path if it matches, or is a prefix of, or is under a selected glob
    return opts.only.some((p) => matchGlob(p, path));
  }
  void s;
  return true;
}

function coerce(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (t !== "" && !Number.isNaN(Number(t))) return Number(t);
  return v;
}

function scalarEqual(a: unknown, b: unknown, opts: DiffOptions): boolean {
  if (opts.loose) {
    a = coerce(a);
    b = coerce(b);
  }
  const sa = scalarValue(a);
  const sb = scalarValue(b);
  // Object.is keeps NaN == NaN (from YAML `.nan`); the extra `===` treats +0 and
  // -0 as equal — numerically the same config value, so `0 => -0` isn't a change
  // (Object.is alone would report a useless "0 => 0" diff).
  return Object.is(sa, sb) || sa === sb;
}

/** Stable-ish key for multiset array comparison. */
function valueKey(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    // BigInt (lossless large integers) isn't JSON-serialisable; tag it so two
    // distinct big integers get distinct, stable keys.
    if (typeof val === "bigint") return `${val.toString()}n`;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

export function diff(a: unknown, b: unknown, opts: DiffOptions = {}): Change[] {
  const changes: Change[] = [];
  walk(a, b, [], changes, opts);
  return changes;
}

function walk(a: unknown, b: unknown, path: Path, out: Change[], opts: DiffOptions): void {
  const ta = typeOf(a);
  const tb = typeOf(b);

  if (ta === "object" && tb === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of [...keys].sort()) {
      const childPath = [...path, k];
      const inA = Object.prototype.hasOwnProperty.call(ao, k);
      const inB = Object.prototype.hasOwnProperty.call(bo, k);
      if (inA && !inB) {
        if (pathSelected(childPath, opts)) out.push({ path: childPath, kind: "remove", oldValue: ao[k] });
      } else if (!inA && inB) {
        if (pathSelected(childPath, opts)) out.push({ path: childPath, kind: "add", newValue: bo[k] });
      } else {
        walk(ao[k], bo[k], childPath, out, opts);
      }
    }
    return;
  }

  if (ta === "array" && tb === "array") {
    const av = a as unknown[];
    const bv = b as unknown[];
    const keyField = opts.arrayKey && opts.arrayKey.length > 0 ? resolveArrayKey(path, av, bv, opts.arrayKey) : undefined;
    if (keyField) {
      diffArrayKeyed(av, bv, path, out, opts, keyField);
    } else if (opts.arraySet) {
      diffArraySet(av, bv, path, out, opts);
    } else {
      diffArrayIndexed(av, bv, path, out, opts);
    }
    return;
  }

  // At least one side is a scalar (or a container facing a non-matching type).
  // Container-vs-anything mismatch is always a type change.
  const containerA = ta === "object" || ta === "array";
  const containerB = tb === "object" || tb === "array";
  if (containerA || containerB) {
    if (pathSelected(path, opts))
      out.push({ path, kind: "change", oldValue: a, newValue: b, typeChanged: true });
    return;
  }

  // Both scalars. In loose mode we coerce first so "3"==3 and "true"==true.
  if (scalarEqual(a, b, opts)) return;
  if (pathSelected(path, opts))
    out.push({ path, kind: "change", oldValue: a, newValue: b, typeChanged: ta !== tb });
}

function diffArrayIndexed(a: unknown[], b: unknown[], path: Path, out: Change[], opts: DiffOptions): void {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const childPath = [...path, i];
    if (i >= b.length) {
      if (pathSelected(childPath, opts)) out.push({ path: childPath, kind: "remove", oldValue: a[i] });
    } else if (i >= a.length) {
      if (pathSelected(childPath, opts)) out.push({ path: childPath, kind: "add", newValue: b[i] });
    } else {
      walk(a[i], b[i], childPath, out, opts);
    }
  }
}

/** Is `v` a plain object that carries a scalar-valued `field`? */
function keyableBy(v: unknown, field: string): boolean {
  if (!isPlainObject(v)) return false;
  const rec = v as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rec, field)) return false;
  const fv = rec[field];
  return fv === null || (typeof fv !== "object" && typeof fv !== "function");
}

/**
 * Decide which key field (if any) to use for matching this pair of arrays.
 * Tries each configured entry in order: scoped `pathGlob=field` entries whose
 * glob matches this array's path, plus bare `field` entries that apply
 * everywhere. A field is usable only when EVERY element on both sides is a plain
 * object carrying that field as a scalar AND its values are unique within each
 * side (otherwise keying would be ambiguous, so we fall back to indexed diff).
 */
function resolveArrayKey(path: Path, a: unknown[], b: unknown[], specs: string[]): string | undefined {
  if (a.length === 0 && b.length === 0) return undefined;
  const candidates: string[] = [];
  for (const spec of specs) {
    const eq = spec.indexOf("=");
    if (eq >= 0) {
      const glob = spec.slice(0, eq);
      const field = spec.slice(eq + 1);
      if (field && matchGlob(glob, path)) candidates.push(field);
    } else if (spec) {
      candidates.push(spec);
    }
  }
  for (const field of candidates) {
    const all = [...a, ...b];
    if (!all.every((v) => keyableBy(v, field))) continue;
    if (uniqueKeyed(a, field) && uniqueKeyed(b, field)) return field;
  }
  return undefined;
}

function uniqueKeyed(arr: unknown[], field: string): boolean {
  const seen = new Set<string>();
  for (const v of arr) {
    const k = valueKey((v as Record<string, unknown>)[field]);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

function diffArrayKeyed(
  a: unknown[],
  b: unknown[],
  path: Path,
  out: Change[],
  opts: DiffOptions,
  field: string,
): void {
  const mapA = new Map<string, unknown>();
  const mapB = new Map<string, unknown>();
  const order: string[] = [];
  const raw = new Map<string, unknown>();
  for (const v of a) {
    const fv = (v as Record<string, unknown>)[field];
    const k = valueKey(fv);
    mapA.set(k, v);
    if (!raw.has(k)) {
      raw.set(k, fv);
      order.push(k);
    }
  }
  for (const v of b) {
    const fv = (v as Record<string, unknown>)[field];
    const k = valueKey(fv);
    mapB.set(k, v);
    if (!raw.has(k)) {
      raw.set(k, fv);
      order.push(k);
    }
  }
  for (const k of order) {
    const fv = raw.get(k);
    const seg: KeySeg = { key: field, value: fv as KeySeg["value"] };
    const childPath = [...path, seg];
    const inA = mapA.has(k);
    const inB = mapB.has(k);
    if (inA && inB) {
      walk(mapA.get(k), mapB.get(k), childPath, out, opts);
    } else if (inA) {
      if (pathSelected(childPath, opts)) out.push({ path: childPath, kind: "remove", oldValue: mapA.get(k) });
    } else {
      if (pathSelected(childPath, opts)) out.push({ path: childPath, kind: "add", newValue: mapB.get(k) });
    }
  }
}

function diffArraySet(a: unknown[], b: unknown[], path: Path, out: Change[], opts: DiffOptions): void {
  const counts = new Map<string, number>();
  const sample = new Map<string, unknown>();
  for (const v of a) {
    const k = valueKey(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!sample.has(k)) sample.set(k, v);
  }
  for (const v of b) {
    const k = valueKey(v);
    counts.set(k, (counts.get(k) ?? 0) - 1);
    if (!sample.has(k)) sample.set(k, v);
  }
  for (const [k, c] of counts) {
    if (c > 0) {
      for (let n = 0; n < c; n++)
        if (pathSelected(path, opts)) out.push({ path: [...path, "{set}"], kind: "remove", oldValue: sample.get(k) });
    } else if (c < 0) {
      for (let n = 0; n < -c; n++)
        if (pathSelected(path, opts)) out.push({ path: [...path, "{set}"], kind: "add", newValue: sample.get(k) });
    }
  }
}

export function formatPath(path: Path): string {
  return pathToString(path) || "(root)";
}
