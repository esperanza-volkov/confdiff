import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFormat, sniff, parseEnv, parseContent } from "../src/parse.ts";

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
