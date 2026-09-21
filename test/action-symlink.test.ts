import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ACTION = join(here, "..", "action", "index.mjs");

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), "confdiff-action-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@test.com"]);
  git(dir, ["config", "user.name", "test"]);
  return dir;
}

function runAction(repo: string, base: string) {
  return spawnSync(process.execPath, [ACTION], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_WORKSPACE: repo,
      INPUT_BASE: base,
      INPUT_COMMENT: "false",
      INPUT_REDACT: "false",
      INPUT_FAIL_ON_DIFF: "false",
      INPUT_PATHS: "",
      INPUT_ARGS: "",
      GITHUB_EVENT_PATH: "",
    },
  });
}

test("action: symlink retargeted outside the workspace is skipped, not read", () => {
  const repo = initRepo();
  const secretDir = mkdtempSync(join(tmpdir(), "confdiff-secret-"));
  writeFileSync(join(secretDir, "secret.json"), '{"TOP_SECRET_MARKER": true}\n');

  writeFileSync(join(repo, "shared.json"), '{"a": 1}\n');
  symlinkSync("shared.json", join(repo, "config.json"));
  git(repo, ["add", "shared.json", "config.json"]);
  git(repo, ["commit", "-q", "-m", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);

  // Retarget the tracked symlink to point outside the workspace.
  spawnSync("rm", [join(repo, "config.json")]);
  symlinkSync(join(secretDir, "secret.json"), join(repo, "config.json"));
  git(repo, ["add", "config.json"]);
  git(repo, ["commit", "-q", "-m", "head"]);

  const r = runAction(repo, base);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /TOP_SECRET_MARKER/);
  assert.match(r.stdout, /resolves outside the workspace/);
});

test("action: a normal in-workspace config change still produces a semantic diff", () => {
  const repo = initRepo();
  writeFileSync(join(repo, "config.json"), '{"a": 1}\n');
  git(repo, ["add", "config.json"]);
  git(repo, ["commit", "-q", "-m", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);

  writeFileSync(join(repo, "config.json"), '{"a": 2}\n');
  git(repo, ["add", "config.json"]);
  git(repo, ["commit", "-q", "-m", "head"]);

  const r = runAction(repo, base);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /resolves outside the workspace/);
  assert.match(r.stdout, /config\.json/);
  assert.match(r.stdout, /1 => 2/);
});
