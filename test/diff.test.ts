import { test } from "node:test";
import assert from "node:assert/strict";
import { diff } from "../src/diff.ts";
import { compare } from "../src/index.ts";

test("no changes on identical objects", () => {
  assert.deepEqual(diff({ a: 1, b: 2 }, { a: 1, b: 2 }), []);
});

test("key order does not matter", () => {
  assert.deepEqual(diff({ a: 1, b: 2 }, { b: 2, a: 1 }), []);
});

test("detects value change", () => {
  const d = diff({ a: 1 }, { a: 2 });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "change");
  assert.deepEqual(d[0].path, ["a"]);
  assert.equal(d[0].oldValue, 1);
  assert.equal(d[0].newValue, 2);
});

test("detects add and remove", () => {
  const d = diff({ a: 1 }, { b: 2 });
  const kinds = d.map((c) => `${c.kind}:${c.path.join(".")}`).sort();
  assert.deepEqual(kinds, ["add:b", "remove:a"]);
});

test("nested paths", () => {
  const d = diff({ x: { y: { z: 1 } } }, { x: { y: { z: 2 } } });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["x", "y", "z"]);
});

test("type change is flagged", () => {
  const d = diff({ a: "1" }, { a: 1 });
  assert.equal(d.length, 1);
  assert.equal(d[0].typeChanged, true);
});

test("loose coercion treats string/number/bool as equal", () => {
  assert.deepEqual(diff({ a: "1", b: "true", c: "false" }, { a: 1, b: true, c: false }, { loose: true }), []);
});

test("array index diff", () => {
  const d = diff([1, 2, 3], [1, 9, 3]);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, [1]);
});

test("array length change", () => {
  const d = diff([1, 2], [1, 2, 3]);
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "add");
  assert.deepEqual(d[0].path, [2]);
});

test("array-set ignores order", () => {
  assert.deepEqual(diff([3, 1, 2], [1, 2, 3], { arraySet: true }), []);
});

test("array-set detects added/removed element", () => {
  const d = diff([1, 2], [2, 3], { arraySet: true });
  const kinds = d.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["add", "remove"]);
});

test("ignore glob skips paths", () => {
  const d = diff({ meta: { ts: 1 }, val: 1 }, { meta: { ts: 2 }, val: 2 }, { ignore: ["meta.*"] });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["val"]);
});

test("ignore deep glob **", () => {
  const d = diff(
    { a: { b: { timestamp: 1 } }, x: 1 },
    { a: { b: { timestamp: 2 } }, x: 2 },
    { ignore: ["**.timestamp"] },
  );
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["x"]);
});

test("only glob restricts comparison", () => {
  const d = diff({ a: 1, b: 1 }, { a: 2, b: 2 }, { only: ["a"] });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["a"]);
});

test("container-vs-scalar is a type change", () => {
  const d = diff({ a: { b: 1 } }, { a: 5 });
  assert.equal(d.length, 1);
  assert.equal(d[0].typeChanged, true);
});

test("null handling", () => {
  assert.deepEqual(diff({ a: null }, { a: null }), []);
  const d = diff({ a: null }, { a: 1 });
  assert.equal(d.length, 1);
  assert.equal(d[0].typeChanged, true);
});

// ---- cross-format integration via compare() ----

test("compare json vs yaml semantically equal", () => {
  const json = '{"name":"app","replicas":3,"ports":[80,443]}';
  const yaml = "replicas: 3\nname: app\nports:\n  - 80\n  - 443\n";
  assert.deepEqual(compare(json, yaml, { formatA: "json", formatB: "yaml" }), []);
});

test("compare env files with loose", () => {
  const a = "PORT=8080\nDEBUG=false\n";
  const b = "DEBUG=false\nPORT=8080\n";
  assert.deepEqual(compare(a, b, { formatA: "env", formatB: "env" }), []);
});

test("compare toml", () => {
  const a = '[server]\nhost = "0.0.0.0"\nport = 80\n';
  const b = '[server]\nport = 8080\nhost = "0.0.0.0"\n';
  const d = compare(a, b, { formatA: "toml", formatB: "toml" });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["server", "port"]);
});

// ---- exotic scalars (Date, etc.) must not be treated as empty objects ----

test("Date change is detected (regression: TOML/YAML dates)", () => {
  const d = diff({ released: new Date("2024-01-01") }, { released: new Date("2025-06-15") });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "change");
  assert.deepEqual(d[0].path, ["released"]);
});

test("equal Dates report no change", () => {
  assert.deepEqual(diff({ t: new Date("2024-01-01") }, { t: new Date("2024-01-01") }), []);
});

test("Date vs object is a type change", () => {
  const d = diff({ t: new Date("2024-01-01") }, { t: { y: 2024 } });
  assert.equal(d.length, 1);
  assert.equal(d[0].typeChanged, true);
});
