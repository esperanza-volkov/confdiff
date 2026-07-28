import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFormat, sniff, parseEnv, parseContent, parseCsv, keyRowsByColumn } from "../src/parse.ts";

test("detect by extension", () => {
  assert.equal(detectFormat("a.json", "{}"), "json");
  assert.equal(detectFormat("a.yaml", ""), "yaml");
  assert.equal(detectFormat("a.yml", ""), "yaml");
  assert.equal(detectFormat("a.toml", ""), "toml");
  assert.equal(detectFormat("a.ini", ""), "ini");
  assert.equal(detectFormat(".env", ""), "env");
  assert.equal(detectFormat(".env.production", ""), "env");
});

test("sniff json", () => {
  assert.equal(sniff('{"a":1}'), "json");
  assert.equal(sniff("[1,2,3]"), "json");
});

test("sniff env vs ini", () => {
  assert.equal(sniff("A=1\nB=2\n"), "env");
  assert.equal(sniff("[section]\nA=1\n"), "ini");
});

test("parseEnv strips quotes and comments", () => {
  const r = parseEnv('A=1 # inline\nB="hello world"\nexport C=3\n# comment\n');
  assert.equal(r.A, "1");
  assert.equal(r.B, "hello world");
  assert.equal(r.C, "3");
});

test("parseContent yaml", () => {
  assert.deepEqual(parseContent("a: 1\nb: two\n", "yaml"), { a: 1, b: "two" });
});

test("parseCsv: basic rows keyed by header", () => {
  const rows = parseCsv("id,name\n1,alice\n2,bob\n");
  assert.deepEqual(rows, [
    { id: "1", name: "alice" },
    { id: "2", name: "bob" },
  ]);
});

test("parseCsv: quoted fields with embedded delimiter and newline", () => {
  const rows = parseCsv('a,b\n"x,y","line1\nline2"\n');
  assert.deepEqual(rows, [{ a: "x,y", b: "line1\nline2" }]);
});

test("parseCsv: escaped double quotes", () => {
  const rows = parseCsv('a\n"she said ""hi"""\n');
  assert.deepEqual(rows, [{ a: 'she said "hi"' }]);
});

test("parseCsv: auto-detects tab delimiter", () => {
  const rows = parseCsv("id\tname\n1\talice\n");
  assert.deepEqual(rows, [{ id: "1", name: "alice" }]);
});

test("parseCsv: auto-detects semicolon delimiter", () => {
  const rows = parseCsv("id;name\n1;alice\n");
  assert.deepEqual(rows, [{ id: "1", name: "alice" }]);
});

test("parseCsv: strips BOM and handles CRLF", () => {
  const rows = parseCsv("\uFEFFid,name\r\n1,alice\r\n");
  assert.deepEqual(rows, [{ id: "1", name: "alice" }]);
});

test("parseContent routes csv", () => {
  assert.deepEqual(parseContent("k\nv", "csv"), [{ k: "v" }]);
});

test("detectFormat maps .csv and .tsv", () => {
  assert.equal(detectFormat("a.csv", ""), "csv");
  assert.equal(detectFormat("a.tsv", ""), "csv");
});

test("keyRowsByColumn: keys rows and throws on dup/missing", () => {
  const rows = [{ id: "1", n: "a" }, { id: "2", n: "b" }];
  assert.deepEqual(keyRowsByColumn(rows, "id"), { "1": { id: "1", n: "a" }, "2": { id: "2", n: "b" } });
  assert.throws(() => keyRowsByColumn(rows, "nope"), /not found/);
  assert.throws(() => keyRowsByColumn([{ id: "1" }, { id: "1" }], "id"), /duplicate/);
});
