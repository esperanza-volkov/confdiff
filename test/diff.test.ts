import { test } from "node:test";
import assert from "node:assert/strict";
import { diff, formatPath } from "../src/diff.ts";
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

test("positive and negative zero are equal (no useless 0 => 0 diff)", () => {
  assert.deepEqual(diff({ z: 0 }, { z: -0 }), []);
  assert.deepEqual(diff({ z: -0 }, { z: 0 }), []);
});

test("NaN equals NaN but differs from a number", () => {
  assert.deepEqual(diff({ x: NaN }, { x: NaN }), []);
  const d = diff({ x: NaN }, { x: 5 });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "change");
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

test("ignore intra-segment wildcard suffix (*_SECRET)", () => {
  const d = diff(
    { API_SECRET: "a", DB_SECRET: "a", KEEP: 1 },
    { API_SECRET: "b", DB_SECRET: "b", KEEP: 2 },
    { ignore: ["*_SECRET"] },
  );
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["KEEP"]);
});

test("ignore intra-segment wildcard prefix (db_*) and ? placeholder", () => {
  const d = diff(
    { db_host: "a", db_port: 1, item1: "x", keep: 1 },
    { db_host: "b", db_port: 2, item1: "y", keep: 2 },
    { ignore: ["db_*", "item?"] },
  );
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["keep"]);
});

test("bare * still matches exactly one whole segment", () => {
  const d = diff(
    { a: { b: 1 }, c: 1 },
    { a: { b: 2 }, c: 2 },
    { only: ["*"] },
  );
  // `*` matches top-level leaf `c` but not the nested `a.b`
  assert.deepEqual(d.map((x) => x.path), [["c"]]);
});

test("only glob restricts comparison", () => {
  const d = diff({ a: 1, b: 1 }, { a: 2, b: 2 }, { only: ["a"] });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["a"]);
});

test("ignore glob targets a key that itself contains dots (k8s annotation)", () => {
  // The printed path is `metadata.annotations.app.kubernetes.io/version`; the
  // same string must be usable as an --ignore glob even though the final key
  // (`app.kubernetes.io/version`) contains dots.
  const a = { metadata: { annotations: { "app.kubernetes.io/version": "1.0", keep: 1 } } };
  const b = { metadata: { annotations: { "app.kubernetes.io/version": "2.0", keep: 2 } } };
  const d = diff(a, b, { ignore: ["metadata.annotations.app.kubernetes.io/version"] });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["metadata", "annotations", "keep"]);
});

test("array index glob accepts bracket notation the tool itself prints (items[0], items[*])", () => {
  // The tool renders array paths as `items[0].name`; that exact string, and the
  // wildcard `items[*].name`, must both be usable as --ignore/--only globs
  // (round-trippable), alongside the dot forms `items.0.name` / `items.*.name`.
  const a = { items: [{ name: "a" }], k: 1 };
  const b = { items: [{ name: "z" }], k: 1 };
  for (const g of ["items[0].name", "items[*].name", "items.0.name", "items.*.name"]) {
    const d = diff(a, b, { ignore: [g] });
    assert.equal(d.length, 0, `pattern ${g} should ignore items[0].name`);
  }
  // A non-matching index must NOT be ignored.
  const d = diff(a, b, { ignore: ["items[1].name"] });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].path, ["items", 0, "name"]);
});

test("bracket [**] ignores everything under an array segment", () => {
  const a = { items: [{ name: "a", x: 1 }], k: 1 };
  const b = { items: [{ name: "z", x: 2 }], k: 9 };
  const d = diff(a, b, { ignore: ["items[**]"] });
  assert.deepEqual(d.map((c) => c.path), [["k"]]);
});

test("only glob selects a dotted key without over-matching siblings", () => {
  const a = { "a.b": 1, a: { b: 10 } };
  const b = { "a.b": 2, a: { b: 20 } };
  // Both a literal `a.b` key and the nested a->b render as `a.b`, so the glob
  // intentionally matches either rendering; both changes are kept.
  const d = diff(a, b, { only: ["a.b"] });
  assert.equal(d.length, 2);
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

test("csv positional compare detects a changed cell", () => {
  const a = "id,role\n1,admin\n2,user\n";
  const b = "id,role\n1,admin\n2,editor\n";
  const d = compare(a, b, { filenameA: "a.csv", filenameB: "b.csv" });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "change");
  assert.deepEqual(d[0].path, [1, "role"]);
  assert.equal(d[0].newValue, "editor");
});

test("csv --csv-key matches rows by key despite reordering", () => {
  const a = "id,role\n1,admin\n2,user\n";
  const b = "id,role\n2,user\n1,superadmin\n"; // reordered + one change
  const positional = compare(a, b, { filenameA: "a.csv", filenameB: "b.csv" });
  assert.ok(positional.length >= 2); // reorder looks like many changes
  const keyed = compare(a, b, { filenameA: "a.csv", filenameB: "b.csv", csvKey: "id" });
  assert.equal(keyed.length, 1);
  assert.deepEqual(keyed[0].path, ["1", "role"]);
  assert.equal(keyed[0].newValue, "superadmin");
});

test("csv with --loose treats numeric strings as equal to numbers when cross-format", () => {
  // csv value "80" vs json number 80 under loose
  const d = compare("port\n80\n", '[{"port":80}]', {
    filenameA: "a.csv",
    formatB: "json",
    loose: true,
  });
  assert.deepEqual(d, []);
});

test("compare xml ignores element/attribute order (semantic)", () => {
  const a = '<c a="1"><x>1</x><y>2</y></c>';
  const b = '<c><y>2</y><x>1</x></c>';
  // same attr + reordered children => only the attribute differs, order does not
  assert.deepEqual(compare(a, a), []);
  const changes = compare(a, b);
  assert.deepEqual(changes.map((c) => c.kind), ["remove"]); // only @_a removed
});

test("compare xml vs json cross-format equal", () => {
  assert.deepEqual(
    compare("<c><port>80</port></c>", '{"c":{"port":80}}', { formatB: "json" }),
    [],
  );
});

test("diff: distinct BigInts are reported as a change (not falsely equal)", () => {
  const d = diff({ id: 12345678901234567890n }, { id: 12345678901234567891n });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "change");
});

test("diff: equal BigInts produce no change", () => {
  assert.equal(diff({ id: 12345678901234567890n }, { id: 12345678901234567890n }).length, 0);
});

test("diff: BigInt inside array-set comparison keys correctly", () => {
  const d = diff({ ids: [12345678901234567890n, 2] }, { ids: [2, 12345678901234567890n] }, { arraySet: true });
  assert.equal(d.length, 0);
});

test("arrayKey: reordered list-of-objects matched by name (no phantom diffs)", () => {
  const a = { env: [{ name: "A", value: "1" }, { name: "B", value: "2" }] };
  const b = { env: [{ name: "B", value: "2" }, { name: "A", value: "1" }] };
  assert.deepEqual(diff(a, b, { arrayKey: ["name"] }), []);
});

test("arrayKey: value change reported against the same-keyed element", () => {
  const a = { env: [{ name: "A", value: "1" }, { name: "B", value: "2" }] };
  const b = { env: [{ name: "B", value: "9" }, { name: "A", value: "1" }] };
  const d = diff(a, b, { arrayKey: ["name"] });
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "change");
  assert.equal(formatPath(d[0].path), "env[name=B].value");
  assert.equal(d[0].oldValue, "2");
  assert.equal(d[0].newValue, "9");
});

test("arrayKey: added and removed elements keyed", () => {
  const a = { env: [{ name: "A", value: "1" }] };
  const b = { env: [{ name: "C", value: "3" }] };
  const d = diff(a, b, { arrayKey: ["name"] });
  const s = d.map((c) => `${c.kind}:${formatPath(c.path)}`).sort();
  assert.deepEqual(s, ["add:env[name=C]", "remove:env[name=A]"]);
});

test("arrayKey: not applicable when an element lacks the field (falls back to indexed)", () => {
  const a = { ports: [{ containerPort: 80 }, { containerPort: 443 }] };
  const b = { ports: [{ containerPort: 443 }, { containerPort: 80 }] };
  // `name` doesn't exist on ports -> indexed diff -> reorder is noise
  assert.equal(diff(a, b, { arrayKey: ["name"] }).length, 2);
  // but keying by containerPort collapses it
  assert.equal(diff(a, b, { arrayKey: ["containerPort"] }).length, 0);
});

test("arrayKey: duplicate key values on a side fall back to indexed (safe)", () => {
  const a = { env: [{ name: "A", value: "1" }, { name: "A", value: "2" }] };
  const b = { env: [{ name: "A", value: "1" }, { name: "A", value: "9" }] };
  const d = diff(a, b, { arrayKey: ["name"] });
  assert.equal(d.length, 1);
  assert.equal(formatPath(d[0].path), "env[1].value");
});

test("arrayKey: scoped pathGlob=field only keys the matching array", () => {
  const a = { items: [{ id: "x", n: 1 }, { id: "y", n: 2 }] };
  const b = { items: [{ id: "y", n: 2 }, { id: "x", n: 1 }] };
  assert.deepEqual(diff(a, b, { arrayKey: ["items=id"] }), []);
  // a non-matching scope leaves it indexed
  assert.equal(diff(a, b, { arrayKey: ["other=id"] }).length > 0, true);
});

test("arrayKey: printed keyed path round-trips into ignore", () => {
  const a = { env: [{ name: "A", value: "1" }] };
  const b = { env: [{ name: "A", value: "2" }] };
  assert.deepEqual(diff(a, b, { arrayKey: ["name"], ignore: ["env[name=A].value"] }), []);
});
