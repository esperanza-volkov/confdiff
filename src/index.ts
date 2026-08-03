export { diff, type Change, type ChangeKind, type DiffOptions, type Path, formatPath, typeOf } from "./diff.js";
export {
  parseContent,
  parseEnv,
  parseCsv,
  parseXml,
  keyRowsByColumn,
  detectFormat,
  sniff,
  type Format,
  type Value,
} from "./parse.js";
export { renderText, renderJson, type RenderOptions } from "./render.js";

import { diff as _diff, type DiffOptions, type Change } from "./diff.js";
import { parseContent, keyRowsByColumn, detectFormat, type Format } from "./parse.js";

export interface CompareOptions extends DiffOptions {
  formatA?: Format;
  formatB?: Format;
  filenameA?: string;
  filenameB?: string;
  /** For CSV inputs: match rows by this column instead of by position. */
  csvKey?: string;
}

/** High-level helper: compare two raw strings of (possibly different) formats. */
export function compare(a: string, b: string, opts: CompareOptions = {}): Change[] {
  const fa = opts.formatA ?? detectFormat(opts.filenameA, a);
  const fb = opts.formatB ?? detectFormat(opts.filenameB, b);
  let va = parseContent(a, fa);
  let vb = parseContent(b, fb);
  if (opts.csvKey) {
    if (fa === "csv") va = keyRowsByColumn(va as Record<string, string>[], opts.csvKey);
    if (fb === "csv") vb = keyRowsByColumn(vb as Record<string, string>[], opts.csvKey);
  }
  return _diff(va, vb, opts);
}
