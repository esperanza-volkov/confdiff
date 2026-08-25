import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "src", "cli.ts");

function runDriver(pathArg: string, oldFile: string, newFile: string) {
  // git external diff convention: path old-file old-hex old-mode new-file new-hex new-mode
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", CLI, "--git-diff-driver", pathArg, oldFile, "0".repeat(40), "100644", newFile, "0".repeat(40), "100644"],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  return r;
}

test("git-diff-driver: maps git's 7 args to old/new and detects format from path", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-"));
  const oldF = join(dir, "old_tmp"); // temp files have no extension, like git's
  const newF = join(dir, "new_tmp");
  writeFileSync(oldF, "b: 2\na: 1\n");
  writeFileSync(newF, "a: 3\nb: 2\n");
  const r = runDriver("config.yaml", oldF, newF);
  assert.equal(r.status, 0, r.stderr); // never abort git
  assert.match(r.stdout, /confdiff config\.yaml/);
  assert.match(r.stdout, /a\s+1 => 3/);
});

test("git-diff-driver: reorder-only shows no semantic changes, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-"));
  const oldF = join(dir, "old_tmp");
  const newF = join(dir, "new_tmp");
  writeFileSync(oldF, "a: 1\nb: 2\n");
  writeFileSync(newF, "b: 2\na: 1\n");
  const r = runDriver("config.yaml", oldF, newF);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no semantic/i);
});

test("git-diff-driver: wrong arg count fails clearly (exit 2)", () => {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", CLI, "--git-diff-driver", "a.yaml", "b.yaml"],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /7 diff arguments/);
});
