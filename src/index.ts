export { diff, type Change, type ChangeKind, type DiffOptions, type Path, formatPath, typeOf } from "./diff.js";
export {
  parseContent,
  parseEnv,
  detectFormat,
  sniff,
  type Format,
  type Value,
} from "./parse.js";
export { renderText, renderJson, type RenderOptions } from "./render.js";

import { diff as _diff, type DiffOptions, type Change } from "./diff.js";
import { parseContent, detectFormat, type Format } from "./parse.js";

export interface CompareOptions extends DiffOptions {
  formatA?: Format;
  formatB?: Format;
  filenameA?: string;
  filenameB?: string;
}

/** High-level helper: compare two raw strings of (possibly different) formats. */
export function compare(a: string, b: string, opts: CompareOptions = {}): Change[] {
  const fa = opts.formatA ?? detectFormat(opts.filenameA, a);
  const fb = opts.formatB ?? detectFormat(opts.filenameB, b);
  const va = parseContent(a, fa);
  const vb = parseContent(b, fb);
  return _diff(va, vb, opts);
}
