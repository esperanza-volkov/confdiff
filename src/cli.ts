#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import pc from "picocolors";
import { diff } from "./diff.js";
import { parseContent, keyRowsByColumn, detectFormat, type Format } from "./parse.js";
import { renderText, renderJson } from "./render.js";
import { makeRedactMatcher } from "./redact.js";
import { installGitDriver, DEFAULT_PATTERNS } from "./gitdriver.js";
import { isDirectory, dirDiff, type DirDiffResult } from "./dirdiff.js";
import type { RedactMatcher } from "./redact.js";

const FORMATS: Format[] = ["json", "yaml", "toml", "ini", "env", "properties", "csv", "xml"];

interface Args {
  files: string[];
  format?: Format;
  formatA?: Format;
  formatB?: Format;
  ignore: string[];
  only: string[];
  arraySet: boolean;
  arrayKey: string[];
  loose: boolean;
  csvKey?: string;
  redact: boolean;
  redactKeys: string[];
  redactEntropy: boolean;
  json: boolean;
  quiet: boolean;
  color?: boolean;
  exitZero: boolean;
  gitDiffDriver: boolean;
  help: boolean;
  version: boolean;
}

function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `${pc.bold("confdiff")} — semantic, format-aware diff for config & structured data

${pc.bold("USAGE")}
  confdiff <a> <b> [options]
  confdiff old.yaml new.yaml
  confdiff config.json config.yaml        # cross-format compare
  confdiff old.csv new.csv --csv-key id   # match CSV rows by a key column
  confdiff old.xml new.xml                # semantic XML (order-insensitive)
  confdiff old-manifests/ new-manifests/  # recurse: diff every config file in a tree
  cat a.env | confdiff - b.env --format env

${pc.bold("OUTPUT")}
  Shows only what semantically changed: added (${pc.green("+")}), removed (${pc.red("-")}),
  changed (${pc.yellow("~")}). Key order, formatting, comments and quoting are ignored.

${pc.bold("OPTIONS")}
  -f, --format <fmt>     Force format for BOTH inputs (${FORMATS.join(", ")})
      --format-a <fmt>   Force format for the first input
      --format-b <fmt>   Force format for the second input
  -i, --ignore <glob>    Ignore paths matching glob (repeatable / comma-separated)
                         e.g. -i "metadata.*" -i "**.timestamp"
  -o, --only <glob>      Only compare paths matching glob (repeatable)
  -l, --loose            Loose scalars: "3"==3, "true"==true (great for .env/.ini)
      --csv-key <col>    For CSV/TSV: match rows by this column, not by position
      --redact           Mask secret values (passwords/tokens/keys) as a stable
                         fingerprint — safe to paste a diff into a PR/Slack/CI
      --redact-key <glob> Also redact values at these key/path globs (repeatable)
      --redact-entropy   Also redact values that LOOK like secrets (long, random,
                         high-entropy tokens) under any key name; implies --redact
      --array-set        Compare arrays as unordered sets (ignore element order)
      --array-key <spec> Match arrays of objects by a key field, not by position
                         (k8s env/containers): --array-key name; scope with
                         <pathGlob>=<field>, repeatable / comma-separated
      --json             Machine-readable JSON output (for CI / scripts)
  -q, --quiet            No output; communicate via exit code only
      --no-color         Disable ANSI color
      --exit-zero        Always exit 0 even when there are differences
  -h, --help             Show this help
  -v, --version          Show version

${pc.bold("EXIT CODES")}
  0  no semantic differences
  1  differences found
  2  usage or parse error

${pc.bold("GIT INTEGRATION")}
  One-time setup, then ${pc.bold("git diff")} shows semantic diffs for config files:
    confdiff install-git-driver          # wire up the current repo
    confdiff install-git-driver --global # wire up all your repos
  This sets diff.confdiff.command and adds patterns (${DEFAULT_PATTERNS.slice(0, 4).join(", ")}, …)
  to .gitattributes. To wire it up by hand instead:
    git config diff.confdiff.command 'confdiff --git-diff-driver'
    echo '*.yaml diff=confdiff' >> .gitattributes

Docs: https://github.com/esperanza-volkov/confdiff
`;

const INSTALL_HELP = `${pc.bold("confdiff install-git-driver")} — set up confdiff as a git diff driver

${pc.bold("USAGE")}
  confdiff install-git-driver [--global] [pattern ...]

${pc.bold("OPTIONS")}
  --global        Configure for all repos (git config --global + global attributes)
  pattern ...     File patterns to wire up (default: ${DEFAULT_PATTERNS.join(" ")})

After running this, ${pc.bold("git diff")} / ${pc.bold("git log -p")} on matching files shows
confdiff's semantic diff instead of raw text. Re-running is safe (idempotent).
`;

function runInstall(rest: string[]): void {
  if (rest.includes("-h") || rest.includes("--help")) {
    process.stdout.write(INSTALL_HELP);
    return;
  }
  let global = false;
  const patterns: string[] = [];
  for (const arg of rest) {
    if (arg === "--global") global = true;
    else if (arg.startsWith("-")) fail(`unknown option "${arg}" for install-git-driver`);
    else patterns.push(arg);
  }
  let res;
  try {
    res = installGitDriver({ global, patterns });
  } catch (e) {
    fail(`could not configure git: ${(e as Error).message}`);
  }
  const scope = res.scope === "global" ? "globally (all repos)" : "for this repo";
  process.stdout.write(
    pc.green("✓ ") + `configured ${pc.bold("git")} diff driver ${scope}\n`,
  );
  process.stdout.write(`  diff.confdiff.command = ${pc.dim(res.command)}\n`);
  if (res.added.length) {
    process.stdout.write(
      `  added to ${pc.bold(res.attributesFile)}:\n` +
        res.added.map((p) => `    ${pc.cyan(p)} diff=confdiff`).join("\n") +
        "\n",
    );
  }
  if (res.alreadyPresent.length) {
    process.stdout.write(
      pc.dim(`  already present: ${res.alreadyPresent.join(", ")}\n`),
    );
  }
  process.stdout.write(
    `\nDone. ${pc.bold("git diff")} on those files now shows semantic changes.\n`,
  );
}

function fail(msg: string): never {
  process.stderr.write(pc.red(`error: `) + msg + "\n");
  process.stderr.write(`Run ${pc.bold("confdiff --help")} for usage.\n`);
  process.exit(2);
}

function asFormat(v: string): Format {
  if ((FORMATS as string[]).includes(v)) return v as Format;
  fail(`unknown format "${v}". Valid: ${FORMATS.join(", ")}`);
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    files: [],
    ignore: [],
    only: [],
    arraySet: false,
    arrayKey: [],
    loose: false,
    redact: false,
    redactKeys: [],
    redactEntropy: false,
    json: false,
    quiet: false,
    exitZero: false,
    gitDiffDriver: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`option ${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "-v":
      case "--version":
        a.version = true;
        break;
      case "-f":
      case "--format":
        a.format = asFormat(next());
        break;
      case "--format-a":
        a.formatA = asFormat(next());
        break;
      case "--format-b":
        a.formatB = asFormat(next());
        break;
      case "-i":
      case "--ignore":
        a.ignore.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "-o":
      case "--only":
        a.only.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "-l":
      case "--loose":
        a.loose = true;
        break;
      case "--csv-key":
        a.csvKey = next();
        break;
      case "--redact":
        a.redact = true;
        break;
      case "--redact-key":
        a.redactKeys.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
        a.redact = true;
        break;
      case "--redact-entropy":
        a.redactEntropy = true;
        a.redact = true;
        break;
      case "--array-set":
        a.arraySet = true;
        break;
      case "--array-key":
        a.arrayKey.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "--json":
        a.json = true;
        break;
      case "-q":
      case "--quiet":
        a.quiet = true;
        break;
      case "--color":
        a.color = true;
        break;
      case "--no-color":
        a.color = false;
        break;
      case "--exit-zero":
        a.exitZero = true;
        break;
      case "--git-diff-driver":
        a.gitDiffDriver = true;
        break;
      default:
        if (arg.startsWith("--") && arg.includes("=")) {
          const eq = arg.indexOf("=");
          argv.splice(i + 1, 0, arg.slice(eq + 1));
          argv[i] = arg.slice(0, eq);
          i--;
          break;
        }
        if (arg.startsWith("-") && arg !== "-") fail(`unknown option "${arg}"`);
        a.files.push(arg);
    }
  }
  return a;
}

function readInput(file: string): string {
  if (file === "-") return readFileSync(0, "utf8");
  try {
    return readFileSync(file, "utf8");
  } catch (e) {
    fail(`cannot read "${file}": ${(e as Error).message}`);
  }
}

function renderDirText(
  result: DirDiffResult,
  color: boolean,
  redact: RedactMatcher | undefined,
): string {
  const c = color ? pc : undefined;
  const b = (s: string) => (c ? c.bold(s) : s);
  const dim = (s: string) => (c ? c.dim(s) : s);
  if (result.files.length === 0) {
    return dim("no semantic changes across the two directories") + "\n";
  }
  let out = "";
  let added = 0,
    removed = 0,
    changed = 0,
    skipped = 0;
  for (const f of result.files) {
    if (f.status === "added") {
      added++;
      const mark = c ? c.green("+ ") : "+ ";
      out += `${mark}${b(f.path)} ${dim("(new file)")}\n`;
    } else if (f.status === "removed") {
      removed++;
      const mark = c ? c.red("- ") : "- ";
      out += `${mark}${b(f.path)} ${dim("(deleted)")}\n`;
    } else if (f.status === "error") {
      skipped++;
      const mark = c ? c.yellow("! ") : "! ";
      out += `${mark}${b(f.path)} ${dim(`(skipped: ${f.error})`)}\n`;
    } else {
      changed++;
      const mark = c ? c.yellow("~ ") : "~ ";
      out += `${mark}${b(f.path)}\n`;
      const body = renderText(f.changes ?? [], { color, redact });
      out += body
        .split("\n")
        .map((l) => (l ? "    " + l : l))
        .join("\n");
      out += "\n";
    }
  }
  const parts: string[] = [];
  if (changed) parts.push(`${changed} changed`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (skipped) parts.push(`${skipped} skipped (parse error)`);
  out += "\n" + b(`${result.files.length} file(s): ` + parts.join(", ")) + "\n";
  return out;
}

function renderDirJson(
  result: DirDiffResult,
  redact: RedactMatcher | undefined,
): string {
  const files = result.files.map((f) => {
    const base: Record<string, unknown> = { path: f.path, status: f.status };
    if (f.status === "error") base.error = f.error;
    if (f.status === "changed" && f.changes) {
      base.changes = JSON.parse(renderJson(f.changes, { redact }));
    }
    return base;
  });
  return JSON.stringify(
    { changed: result.changed, errored: result.errored, files },
    null,
    2,
  );
}

export function main(argv = process.argv.slice(2)): void {
  if (argv[0] === "install-git-driver") {
    runInstall(argv.slice(1));
    return;
  }
  const args = parseArgs(argv);
  if (args.version) {
    process.stdout.write(getVersion() + "\n");
    return;
  }
  if (args.help || (args.files.length === 0 && !args.gitDiffDriver)) {
    process.stdout.write(HELP);
    if (args.files.length === 0 && !args.help) process.exit(2);
    return;
  }

  // Git external diff driver calling convention: git invokes the command with
  // 7 positional args — path old-file old-hex old-mode new-file new-hex new-mode.
  // Map old-file/new-file to our two inputs and use `path` for format detection.
  let driverPath: string | undefined;
  if (args.gitDiffDriver) {
    if (args.files.length !== 7) {
      fail(
        `--git-diff-driver expects git's 7 diff arguments, got ${args.files.length}. ` +
          `It is meant to be used via: git config diff.confdiff.command 'confdiff --git-diff-driver'`,
      );
    }
    driverPath = args.files[0];
    args.files = [args.files[1], args.files[4]];
    // git aborts the whole diff if the driver exits non-zero; never do that.
    args.exitZero = true;
  }

  if (args.files.length !== 2) fail(`expected exactly 2 inputs, got ${args.files.length}`);

  const [fileA, fileB] = args.files;

  // Directory-vs-directory: recursively diff matching config files by relative path.
  const aIsDir = isDirectory(fileA);
  const bIsDir = isDirectory(fileB);
  if (aIsDir || bIsDir) {
    if (!(aIsDir && bIsDir)) {
      fail(
        `both inputs must be directories to diff a tree (got ${
          aIsDir ? "a directory and a file" : "a file and a directory"
        })`,
      );
    }
    const redactMatcherDir = args.redact
      ? makeRedactMatcher(true, args.redactKeys, args.redactEntropy)
      : undefined;
    let result: DirDiffResult;
    try {
      result = dirDiff(fileA, fileB, {
        ignore: args.ignore,
        only: args.only,
        arraySet: args.arraySet,
        arrayKey: args.arrayKey,
        loose: args.loose,
        csvKey: args.csvKey,
      });
    } catch (e) {
      fail((e as Error).message);
    }
    if (!args.quiet) {
      if (args.json) {
        process.stdout.write(renderDirJson(result, redactMatcherDir) + "\n");
      } else {
        const color = args.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);
        process.stdout.write(renderDirText(result, !!color, redactMatcherDir));
      }
    }
    // Exit-code precedence matches single-file mode: a parse/read error is a
    // hard failure (2), differences are 1, a clean tree is 0. --exit-zero (and
    // the git driver) still forces 0.
    process.exit(
      args.exitZero ? 0 : result.errored ? 2 : result.changed ? 1 : 0,
    );
  }
  const rawA = readInput(fileA);
  const rawB = readInput(fileB);

  const nameA = driverPath ?? (fileA === "-" ? undefined : basename(fileA));
  const nameB = driverPath ?? (fileB === "-" ? undefined : basename(fileB));
  const fmtA = args.formatA ?? args.format ?? detectFormat(nameA, rawA);
  const fmtB = args.formatB ?? args.format ?? detectFormat(nameB, rawB);

  let valA: unknown;
  let valB: unknown;
  try {
    valA = parseContent(rawA, fmtA);
  } catch (e) {
    fail(`failed to parse "${fileA}" as ${fmtA}: ${(e as Error).message}`);
  }
  try {
    valB = parseContent(rawB, fmtB);
  } catch (e) {
    fail(`failed to parse "${fileB}" as ${fmtB}: ${(e as Error).message}`);
  }

  if (args.csvKey) {
    try {
      if (fmtA === "csv") valA = keyRowsByColumn(valA as Record<string, string>[], args.csvKey);
      if (fmtB === "csv") valB = keyRowsByColumn(valB as Record<string, string>[], args.csvKey);
    } catch (e) {
      fail((e as Error).message);
    }
  }

  const changes = diff(valA, valB, {
    ignore: args.ignore,
    only: args.only,
    arraySet: args.arraySet,
    arrayKey: args.arrayKey,
    loose: args.loose,
  });

  // Built-in secret heuristics are always active when redaction is on (adding
  // --redact-key extends them). Erring toward over-redaction is safe; the failure
  // mode to avoid is leaking a value the heuristics didn't catch.
  const redactMatcher = args.redact ? makeRedactMatcher(true, args.redactKeys, args.redactEntropy) : undefined;

  if (!args.quiet) {
    if (args.json) {
      process.stdout.write(renderJson(changes, { redact: redactMatcher }) + "\n");
    } else {
      const color = args.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);
      if (driverPath) {
        const header = `confdiff ${driverPath}`;
        process.stdout.write((color ? pc.bold(header) : header) + "\n");
        if (changes.length === 0) {
          process.stdout.write((color ? pc.dim("  (no semantic changes)") : "  (no semantic changes)") + "\n");
        }
      }
      process.stdout.write(renderText(changes, { color: !!color, redact: redactMatcher }) + "\n");
    }
  }

  process.exit(args.exitZero ? 0 : changes.length > 0 ? 1 : 0);
}

main();
