import pc from "picocolors";
import { type Change, formatPath } from "./diff.js";

export interface RenderOptions {
  color?: boolean;
  labelA?: string;
  labelB?: string;
}

function preview(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") {
    const json = JSON.stringify(v);
    if (json.length <= 60) return json;
    return json.slice(0, 57) + "...";
  }
  return String(v);
}

export function renderText(changes: Change[], opts: RenderOptions = {}): string {
  const useColor = opts.color ?? true;
  const c = useColor ? pc : passthrough();

  if (changes.length === 0) {
    return c.dim("no semantic differences");
  }

  const lines: string[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const ch of changes) {
    const p = formatPath(ch.path);
    if (ch.kind === "add") {
      added++;
      lines.push(`${c.green("+")} ${c.green(p)}  ${c.dim("=")} ${c.green(preview(ch.newValue))}`);
    } else if (ch.kind === "remove") {
      removed++;
      lines.push(`${c.red("-")} ${c.red(p)}  ${c.dim("=")} ${c.red(preview(ch.oldValue))}`);
    } else {
      changed++;
      const tag = ch.typeChanged ? c.dim(" (type)") : "";
      lines.push(
        `${c.yellow("~")} ${c.yellow(p)}${tag}  ${c.red(preview(ch.oldValue))} ${c.dim("=>")} ${c.green(
          preview(ch.newValue),
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

export function renderJson(changes: Change[]): string {
  return JSON.stringify(
    {
      changed: changes.length > 0,
      count: changes.length,
      changes: changes.map((ch) => ({
        path: ch.path,
        pointer: "/" + ch.path.map((s) => String(s)).join("/"),
        kind: ch.kind,
        ...(ch.oldValue !== undefined || ch.kind !== "add" ? { oldValue: ch.oldValue } : {}),
        ...(ch.newValue !== undefined || ch.kind !== "remove" ? { newValue: ch.newValue } : {}),
        ...(ch.typeChanged ? { typeChanged: true } : {}),
      })),
    },
    null,
    2,
  );
}

function passthrough(): typeof pc {
  const id = (s: string) => s;
  return new Proxy({} as typeof pc, {
    get: () => id,
  });
}
