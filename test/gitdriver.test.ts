import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installGitDriver, DEFAULT_PATTERNS, DRIVER_COMMAND } from "../src/gitdriver.ts";

function fakeGit() {
  const calls: string[][] = [];
  return {
    calls,
    fn: (args: string[]) => {
      calls.push(args);
      return "";
    },
  };
}

test("installGitDriver: local scope sets config and writes .gitattributes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cd-"));
  const git = fakeGit();
  const res = installGitDriver({ global: false, patterns: [], git: git.fn, cwd });

  assert.equal(res.scope, "local");
  assert.equal(res.command, DRIVER_COMMAND);
  assert.deepEqual(res.added, DEFAULT_PATTERNS);
  assert.deepEqual(res.alreadyPresent, []);
  // git config was called without --global
  assert.deepEqual(git.calls[0], ["config", "diff.confdiff.command", DRIVER_COMMAND]);

  const attr = readFileSync(join(cwd, ".gitattributes"), "utf8");
  for (const p of DEFAULT_PATTERNS) assert.match(attr, new RegExp(`^${p.replace(/[.*]/g, "\\$&")} diff=confdiff$`, "m"));
});

test("installGitDriver: idempotent — existing lines are not duplicated", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cd-"));
  writeFileSync(join(cwd, ".gitattributes"), "*.json diff=confdiff\n# comment\n");
  const git = fakeGit();
  const res = installGitDriver({ global: false, patterns: ["*.json", "*.yaml"], git: git.fn, cwd });

  assert.deepEqual(res.alreadyPresent, ["*.json"]);
  assert.deepEqual(res.added, ["*.yaml"]);
  const attr = readFileSync(join(cwd, ".gitattributes"), "utf8");
  // exactly one *.json line
  assert.equal((attr.match(/^\*\.json diff=confdiff$/gm) || []).length, 1);
  assert.match(attr, /^\*\.yaml diff=confdiff$/m);
  // preserves prior content (comment)
  assert.match(attr, /# comment/);
});

test("installGitDriver: preserves a file without trailing newline", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cd-"));
  writeFileSync(join(cwd, ".gitattributes"), "*.md text"); // no newline
  const git = fakeGit();
  installGitDriver({ global: false, patterns: ["*.json"], git: git.fn, cwd });
  const attr = readFileSync(join(cwd, ".gitattributes"), "utf8");
  assert.match(attr, /^\*\.md text$/m);
  assert.match(attr, /^\*\.json diff=confdiff$/m);
});

test("installGitDriver: global scope honours core.attributesFile", () => {
  const cwd = mkdtempSync(join(tmpdir(), "cd-"));
  const target = join(cwd, "myattributes");
  const git = {
    calls: [] as string[][],
    fn: (args: string[]) => {
      git.calls.push(args);
      if (args.includes("--get") && args.includes("core.attributesFile")) return target;
      return "";
    },
  };
  const res = installGitDriver({ global: true, patterns: ["*.json"], git: git.fn, cwd });
  assert.equal(res.scope, "global");
  assert.equal(res.attributesFile, target);
  // config call used --global
  assert.deepEqual(git.calls[0], ["config", "--global", "diff.confdiff.command", DRIVER_COMMAND]);
  assert.ok(existsSync(target));
  assert.match(readFileSync(target, "utf8"), /^\*\.json diff=confdiff$/m);
});
