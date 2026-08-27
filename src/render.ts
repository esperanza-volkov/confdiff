import pc from "picocolors";
import { type Change, formatPath } from "./diff.js";
import { redactToken, type RedactMatcher } from "./redact.js";

export interface RenderOptions {
  color?: boolean;
  labelA?: string;
  labelB?: string;
  /** If set, values at matching paths are replaced with a non-reversible fingerprint. */
  redact?: RedactMatcher;
}

function preview(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") {
    const json = JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
    if (json.length <= 60) return json;
    return json.slice(0, 57) + "...";
  }
  return String(v);
}

export function renderText(changes: Change[], opts: RenderOptions = {}): string {
  const useColor = opts.color ?? true;
  const c = useColor ? pc : passthrough();
  const redact = opts.redact;
  // Redact a change if its key looks secret OR either side's value does; mask
  // both sides together so drift stays visible (differing fingerprints).
  const isMasked = (ch: Change): boolean =>
    !!redact && (redact(ch.path, ch.oldValue) || redact(ch.path, ch.newValue));
  const show = (ch: Change, v: unknown): string =>
    isMasked(ch) ? redactToken(v) : preview(v);

  if (changes.length === 0) {
    return c.dim("no semantic differences");
  }

  const lines: string[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  // Pad the path column so values line up in a clean second column.
  const width = Math.min(
    40,
    changes.reduce((m, ch) => Math.max(m, formatPath(ch.path).length), 0),
  );
  const pad = (s: string) => (s.length >= width ? s : s + " ".repeat(width - s.length));

  for (const ch of changes) {
    const p = formatPath(ch.path);
    if (ch.kind === "add") {
      added++;
      lines.push(`${c.green("+")} ${c.green(pad(p))}  ${c.dim("=")} ${c.green(show(ch, ch.newValue))}`);
    } else if (ch.kind === "remove") {
      removed++;
      lines.push(`${c.red("-")} ${c.red(pad(p))}  ${c.dim("=")} ${c.red(show(ch, ch.oldValue))}`);
    } else {
      changed++;
      const tag = ch.typeChanged ? c.dim(" (type)") : "";
      lines.push(
        `${c.yellow("~")} ${c.yellow(pad(p))}${tag}  ${c.red(show(ch, ch.oldValue))} ${c.dim("=>")} ${c.green(
          show(ch, ch.newValue),
        )}`,
      );
    }
  }

  const parts: string[] = [];
  if (added) parts.push(c.green(`${added} added`));
  if (removed) parts.push(c.red(`${removed} removed`));
  if (changed) parts.push(c.yellow(`${changed} changed`));
  lines.push("");
  lines.push(c.bold(`${changes.length} change${changes.length === 1 ? "" : "s"}: `) + parts.join(", "));
  return lines.join("\n");
}

/**
 * Build an RFC 6901 JSON Pointer from a path. Keys are escaped so that a `/`
 * inside a key (e.g. the k8s annotation `app.kubernetes.io/name`) becomes `~1`
 * and a literal `~` becomes `~0` — otherwise the pointer would be ambiguous and
 * break any downstream JSON Pointer consumer. An empty path is the whole
 * document, whose pointer is the empty string.
 */
function toJsonPointer(path: Change["path"]): string {
  return path
    .map((s) => "/" + String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("");
}

export function renderJson(changes: Change[], opts: { redact?: RedactMatcher } = {}): string {
  // Large integers are preserved as BigInt (lossless); emit them as decimal
  // strings so the JSON stays valid and precise (a raw number would round).
  const bigIntSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
  const redact = opts.redact;
  return JSON.stringify(
    {
      changed: changes.length > 0,
      count: changes.length,
      changes: changes.map((ch) => {
        const masked = !!(redact && (redact(ch.path, ch.oldValue) || redact(ch.path, ch.newValue)));
        const old = masked ? redactToken(ch.oldValue) : ch.oldValue;
        const nw = masked ? redactToken(ch.newValue) : ch.newValue;
        return {
          path: ch.path,
          pointer: toJsonPointer(ch.path),
          kind: ch.kind,
          ...(ch.oldValue !== undefined || ch.kind !== "add" ? { oldValue: old } : {}),
          ...(ch.newValue !== undefined || ch.kind !== "remove" ? { newValue: nw } : {}),
          ...(ch.typeChanged ? { typeChanged: true } : {}),
          ...(masked ? { redacted: true } : {}),
        };
      }),
    },
    bigIntSafe,
    2,
  );
}

function passthrough(): typeof pc {
  const id = (s: string) => s;
  return new Proxy({} as typeof pc, {
    get: () => id,
  });
}
