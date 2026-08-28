// Browser entry for the confdiff playground. Bundled to docs/playground.js.
import { compare, detectFormat, renderJson, type Format } from "../src/index.js";
import { formatPath, type Change } from "../src/diff.js";
import { makeRedactMatcher, redactToken, type RedactMatcher } from "../src/redact.js";

const FORMATS: Format[] = ["json", "yaml", "toml", "ini", "env", "properties", "csv", "xml"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function preview(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") {
    const j = JSON.stringify(v);
    return j.length <= 60 ? j : j.slice(0, 57) + "...";
  }
  return String(v);
}

export interface RunResult {
  html: string;
  json: string;
  count: number;
  error?: string;
  fa?: Format;
  fb?: Format;
}

export function run(
  a: string,
  b: string,
  opts: { formatA?: Format | "auto"; formatB?: Format | "auto"; loose?: boolean; arraySet?: boolean; arrayKey?: string[]; redact?: boolean; redactEntropy?: boolean } = {},
): RunResult {
  try {
    const fa = (opts.formatA && opts.formatA !== "auto" ? opts.formatA : detectFormat(undefined, a)) as Format;
    const fb = (opts.formatB && opts.formatB !== "auto" ? opts.formatB : detectFormat(undefined, b)) as Format;
    const changes: Change[] = compare(a, b, {
      formatA: fa,
      formatB: fb,
      loose: opts.loose,
      arraySet: opts.arraySet,
      arrayKey: opts.arrayKey,
    });
    const redact = opts.redact || opts.redactEntropy ? makeRedactMatcher(true, [], !!opts.redactEntropy) : undefined;
    return { html: renderHtml(changes, redact), json: renderJson(changes, { redact }), count: changes.length, fa, fb };
  } catch (e) {
    return { html: "", json: "", count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

function renderHtml(changes: Change[], redact?: RedactMatcher): string {
  const masked = (ch: Change): boolean =>
    !!redact && (redact(ch.path, ch.oldValue) || redact(ch.path, ch.newValue));
  const show = (ch: Change, v: unknown): string =>
    masked(ch) ? redactToken(v) : preview(v);
  if (changes.length === 0) return `<div class="cd-none">no semantic differences</div>`;
  let added = 0, removed = 0, changed = 0;
  const rows = changes.map((ch) => {
    const p = esc(formatPath(ch.path));
    if (ch.kind === "add") {
      added++;
      return `<div class="cd-row cd-add"><span class="cd-sign">+</span><span class="cd-path">${p}</span><span class="cd-val">= ${esc(show(ch, ch.newValue))}</span></div>`;
    }
    if (ch.kind === "remove") {
      removed++;
      return `<div class="cd-row cd-rem"><span class="cd-sign">-</span><span class="cd-path">${p}</span><span class="cd-val">= ${esc(show(ch, ch.oldValue))}</span></div>`;
    }
    changed++;
    const tag = ch.typeChanged ? ` <span class="cd-type">(type)</span>` : "";
    return `<div class="cd-row cd-chg"><span class="cd-sign">~</span><span class="cd-path">${p}${tag}</span><span class="cd-val"><span class="cd-old">${esc(show(ch, ch.oldValue))}</span> &rarr; <span class="cd-new">${esc(show(ch, ch.newValue))}</span></span></div>`;
  });
  const parts: string[] = [];
  if (added) parts.push(`<span class="cd-add">${added} added</span>`);
  if (removed) parts.push(`<span class="cd-rem">${removed} removed</span>`);
  if (changed) parts.push(`<span class="cd-chg">${changed} changed</span>`);
  rows.push(`<div class="cd-summary"><b>${changes.length} change${changes.length === 1 ? "" : "s"}:</b> ${parts.join(", ")}</div>`);
  return rows.join("\n");
}

// expose on window
(globalThis as any).confdiff = { run, FORMATS };
