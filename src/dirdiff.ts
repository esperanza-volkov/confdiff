import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { diff, type Change, type DiffOptions } from "./diff.js";
import {
  parseContent,
  detectFormat,
  keyRowsByColumn,
  isConfigFilename,
} from "./parse.js";

export type FileStatus = "added" | "removed" | "changed" | "error";

export interface FileEntry {
  /** POSIX-style relative path within the compared directories. */
  path: string;
  status: FileStatus;
  /** Semantic changes for a "changed" file. */
  changes?: Change[];
  /** Human-readable error for an "error" file (e.g. parse failure on one side). */
  error?: string;
}

export interface DirDiffResult {
  files: FileEntry[];
  /** True if any added/removed/changed file was found. */
  changed: boolean;
  /** True if any file could not be parsed on one/both sides (exit 2). */
  errored: boolean;
}

export interface DirDiffOptions extends DiffOptions {
  csvKey?: string;
}

export function isDirectory(p: string): boolean {
  if (p === "-") return false;
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Recursively collect POSIX-normalized relative paths of config files under `root`. */
function collectConfigFiles(root: string): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name;
      // Skip common noise directories that never hold meaningful config.
      if (e.isDirectory()) {
        if (name === ".git" || name === "node_modules") continue;
        walk(join(dir, name));
      } else if (e.isFile() || e.isSymbolicLink()) {
        if (isConfigFilename(name)) {
          const rel = relative(root, join(dir, name)).split(sep).join("/");
          found.add(rel);
        }
      }
    }
  };
  walk(root);
  return found;
}

function loadValue(
  absPath: string,
  relPath: string,
  csvKey: string | undefined,
): unknown {
  const raw = readFileSync(absPath, "utf8");
  const fmt = detectFormat(relPath, raw);
  let val = parseContent(raw, fmt);
  if (csvKey && fmt === "csv") {
    val = keyRowsByColumn(val as Record<string, string>[], csvKey);
  }
  return val;
}

/**
 * Compare two directory trees file-by-file, matching config files by their
 * relative path and reporting per-file semantic changes. Files present on only
 * one side are reported as added/removed.
 */
export function dirDiff(
  dirA: string,
  dirB: string,
  opts: DirDiffOptions = {},
): DirDiffResult {
  const filesA = collectConfigFiles(dirA);
  const filesB = collectConfigFiles(dirB);
  const all = new Set<string>([...filesA, ...filesB]);
  const sorted = [...all].sort();

  const diffOpts: DiffOptions = {
    ignore: opts.ignore,
    only: opts.only,
    arraySet: opts.arraySet,
    arrayKey: opts.arrayKey,
    loose: opts.loose,
  };

  const files: FileEntry[] = [];
  for (const rel of sorted) {
    const inA = filesA.has(rel);
    const inB = filesB.has(rel);
    if (inA && !inB) {
      files.push({ path: rel, status: "removed" });
      continue;
    }
    if (!inA && inB) {
      files.push({ path: rel, status: "added" });
      continue;
    }
    // Present on both sides — diff the parsed models.
    try {
      const valA = loadValue(join(dirA, rel), rel, opts.csvKey);
      const valB = loadValue(join(dirB, rel), rel, opts.csvKey);
      const changes = diff(valA, valB, diffOpts);
      if (changes.length > 0) {
        files.push({ path: rel, status: "changed", changes });
      }
    } catch (e) {
      files.push({ path: rel, status: "error", error: (e as Error).message });
    }
  }

  const errored = files.some((f) => f.status === "error");
  const changed = files.some((f) => f.status !== "error");
  return { files, changed, errored };
}
