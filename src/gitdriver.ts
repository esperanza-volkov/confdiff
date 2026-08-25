import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** Default file patterns wired to the confdiff diff driver. */
export const DEFAULT_PATTERNS = [
  "*.json",
  "*.yaml",
  "*.yml",
  "*.toml",
  "*.ini",
  "*.env",
  "*.csv",
  "*.tsv",
  "*.xml",
];

/** The command git should run as the external diff driver. */
export const DRIVER_COMMAND = "confdiff --git-diff-driver";

export interface InstallOptions {
  global: boolean;
  patterns: string[];
  /** Injected for testing; defaults to real git via execFileSync. */
  git?: (args: string[]) => string;
  /** Injected for testing; defaults to process.cwd(). */
  cwd?: string;
}

export interface InstallResult {
  scope: "global" | "local";
  attributesFile: string;
  added: string[];
  alreadyPresent: string[];
  command: string;
}

function defaultGit(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * Resolve the git attributes file to write pattern lines into.
 * Global scope honours core.attributesFile, falling back to
 * $XDG_CONFIG_HOME/git/attributes (or ~/.config/git/attributes).
 * Local scope uses <repo>/.gitattributes.
 */
function resolveAttributesFile(global: boolean, git: (a: string[]) => string, cwd: string): string {
  if (!global) return join(cwd, ".gitattributes");
  let configured = "";
  try {
    configured = git(["config", "--global", "--get", "core.attributesFile"]);
  } catch {
    configured = "";
  }
  if (configured) {
    return configured.replace(/^~(?=\/|$)/, homedir());
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "git", "attributes");
}

/**
 * Configure git to use confdiff as an external diff driver and wire the given
 * file patterns to it. Idempotent: existing `<pattern> diff=confdiff` lines are
 * left untouched and reported as alreadyPresent.
 */
export function installGitDriver(opts: InstallOptions): InstallResult {
  const git = opts.git ?? defaultGit;
  const cwd = opts.cwd ?? process.cwd();
  const patterns = opts.patterns.length ? opts.patterns : DEFAULT_PATTERNS;

  const configArgs = ["config"];
  if (opts.global) configArgs.push("--global");
  git([...configArgs, "diff.confdiff.command", DRIVER_COMMAND]);

  const attributesFile = resolveAttributesFile(opts.global, git, cwd);
  const existing = existsSync(attributesFile) ? readFileSync(attributesFile, "utf8") : "";
  const existingLines = new Set(
    existing.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
  );

  const added: string[] = [];
  const alreadyPresent: string[] = [];
  for (const p of patterns) {
    const line = `${p} diff=confdiff`;
    if (existingLines.has(line)) alreadyPresent.push(p);
    else added.push(p);
  }

  if (added.length) {
    let out = existing;
    if (out.length && !out.endsWith("\n")) out += "\n";
    out += added.map((p) => `${p} diff=confdiff`).join("\n") + "\n";
    mkdirSync(dirname(attributesFile), { recursive: true });
    writeFileSync(attributesFile, out);
  }

  return {
    scope: opts.global ? "global" : "local",
    attributesFile,
    added,
    alreadyPresent,
    command: DRIVER_COMMAND,
  };
}
