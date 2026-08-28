import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirDiff, isDirectory } from "../src/dirdiff.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "confdiff-dir-"));
}

test("isDirectory distinguishes dirs, files and '-'", () => {
  const root = scratch();
  writeFileSync(join(root, "a.json"), "{}");
  assert.equal(isDirectory(root), true);
  assert.equal(isDirectory(join(root, "a.json")), false);
  assert.equal(isDirectory("-"), false);
  assert.equal(isDirectory(join(root, "nope")), false);
  rmSync(root, { recursive: true, force: true });
});

test("matches config files by relative path and reports changed/added/removed", () => {
  const a = scratch();
  const b = scratch();
  // changed (reordered keys => no diff should NOT count it)
  writeFileSync(join(a, "svc.json"), '{"port":80,"name":"x"}');
  writeFileSync(join(b, "svc.json"), '{"name":"x","port":80}'); // identical semantics
  // changed (real change) in a nested dir
  mkdirSync(join(a, "nested"));
  mkdirSync(join(b, "nested"));
  writeFileSync(join(a, "nested", "app.yaml"), "replicas: 3\n");
  writeFileSync(join(b, "nested", "app.yaml"), "replicas: 5\n");
  // only in a => removed
  writeFileSync(join(a, "old.toml"), "x = 1\n");
  // only in b => added
  writeFileSync(join(b, "new.env"), "K=v\n");
  // non-config file ignored entirely
  writeFileSync(join(a, "README.md"), "hi");
  writeFileSync(join(b, "README.md"), "bye");

  const res = dirDiff(a, b);
  const byPath = Object.fromEntries(res.files.map((f) => [f.path, f.status]));
  assert.equal(res.changed, true);
  assert.equal(byPath["svc.json"], undefined); // reordered-only => no entry
  assert.equal(byPath["nested/app.yaml"], "changed");
  assert.equal(byPath["old.toml"], "removed");
  assert.equal(byPath["new.env"], "added");
  assert.equal(byPath["README.md"], undefined); // not a config file
  const changed = res.files.find((f) => f.path === "nested/app.yaml");
  assert.equal(changed?.changes?.length, 1);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

test("identical trees report no changes", () => {
  const a = scratch();
  const b = scratch();
  writeFileSync(join(a, "c.yaml"), "a: 1\nb: 2\n");
  writeFileSync(join(b, "c.yaml"), "b: 2\na: 1\n"); // reordered
  const res = dirDiff(a, b);
  assert.equal(res.changed, false);
  assert.equal(res.files.length, 0);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

test("skips .git and node_modules", () => {
  const a = scratch();
  const b = scratch();
  mkdirSync(join(a, "node_modules"));
  writeFileSync(join(a, "node_modules", "dep.json"), '{"x":1}');
  mkdirSync(join(b, ".git"));
  writeFileSync(join(b, ".git", "cfg.ini"), "[x]\ny=1");
  const res = dirDiff(a, b);
  assert.equal(res.files.length, 0);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

test("ignore globs apply across the tree", () => {
  const a = scratch();
  const b = scratch();
  writeFileSync(join(a, "d.yaml"), "replicas: 3\nimage: x\n");
  writeFileSync(join(b, "d.yaml"), "replicas: 5\nimage: y\n");
  const res = dirDiff(a, b, { ignore: ["replicas"] });
  const changed = res.files.find((f) => f.path === "d.yaml");
  assert.equal(changed?.changes?.length, 1); // only image
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});
