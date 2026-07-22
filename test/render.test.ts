import { test } from "node:test";
import assert from "node:assert/strict";
import { diff } from "../src/diff.ts";
import { renderText, renderJson } from "../src/render.ts";

const noColor = { color: false };

test("renderText: no changes", () => {
  assert.equal(renderText([], noColor), "no semantic differences");
});

test("renderText: aligned add/remove/change with summary", () => {
  const d = diff({ a: 1, longKeyName: "x" }, { a: 2, added: true });
  const out = renderText(d, noColor);
  // paths are padded so the value columns align
  assert.match(out, /~ a\s+1 => 2/);
  assert.match(out, /\+ added\s+= true/);
  assert.match(out, /- longKeyName\s+= "x"/);
  assert.match(out, /3 changes: 1 added, 1 removed, 1 changed/);
});

test("renderText: flags type change", () => {
  const d = diff({ port: 80 }, { port: "80" });
  const out = renderText(d, noColor);
  assert.match(out, /\(type\)/);
});

test("renderJson: structured output with pointer", () => {
  const d = diff({ a: 1 }, { a: 2 });
  const parsed = JSON.parse(renderJson(d));
  assert.equal(parsed.changed, true);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.changes[0].pointer, "/a");
  assert.equal(parsed.changes[0].kind, "change");
  assert.equal(parsed.changes[0].oldValue, 1);
  assert.equal(parsed.changes[0].newValue, 2);
});

test("renderJson: empty diff", () => {
  const parsed = JSON.parse(renderJson([]));
  assert.equal(parsed.changed, false);
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.changes, []);
});
