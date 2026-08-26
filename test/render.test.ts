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

test("renderJson: pointer is RFC 6901 escaped (/ and ~ inside keys)", () => {
  const a = { metadata: { annotations: { "app.kubernetes.io/name": "x", "a~b": 1 } } };
  const b = { metadata: { annotations: { "app.kubernetes.io/name": "y", "a~b": 2 } } };
  const parsed = JSON.parse(renderJson(diff(a, b)));
  const pointers = parsed.changes.map((c: { pointer: string }) => c.pointer);
  assert.ok(pointers.includes("/metadata/annotations/app.kubernetes.io~1name"));
  assert.ok(pointers.includes("/metadata/annotations/a~0b"));
});

test("renderJson: empty diff", () => {
  const parsed = JSON.parse(renderJson([]));
  assert.equal(parsed.changed, false);
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.changes, []);
});

test("renderJson: BigInt values serialize as precise decimal strings", () => {
  const d = diff({ id: 12345678901234567890n }, { id: 12345678901234567891n });
  const out = renderJson(d);
  const parsed = JSON.parse(out);
  assert.equal(parsed.changes[0].oldValue, "12345678901234567890");
  assert.equal(parsed.changes[0].newValue, "12345678901234567891");
});

test("renderText: BigInt values print full digits, no 'n' suffix", () => {
  const d = diff({ id: 12345678901234567890n }, { id: 12345678901234567891n });
  const out = renderText(d, { color: false });
  assert.match(out, /12345678901234567890 => 12345678901234567891/);
});

// --- secret redaction (--redact) ---
import { makeRedactMatcher, looksSecret, redactToken } from "../src/redact.ts";

test("looksSecret: matches secret-ish keys, not innocent look-alikes", () => {
  for (const k of ["password", "DB_PASSWORD", "api_token", "apiKey", "ACCESS_KEY", "clientSecret", "passphrase", "refresh_token"])
    assert.ok(looksSecret(k), `${k} should look secret`);
  for (const k of ["keyboard", "monkey", "username", "host", "donkey", "port"])
    assert.ok(!looksSecret(k), `${k} should NOT look secret`);
});

test("renderText: --redact masks secret values but shows they changed", () => {
  const d = diff({ DB_PASSWORD: "hunter2", DEBUG: "false" }, { DB_PASSWORD: "s3cr3t99", DEBUG: "true" });
  const redact = makeRedactMatcher(true, []);
  const out = renderText(d, { color: false, redact });
  assert.doesNotMatch(out, /hunter2|s3cr3t99/); // raw secret never leaks
  assert.match(out, /DB_PASSWORD\s+«redacted:[0-9a-f]{6}» => «redacted:[0-9a-f]{6}»/);
  assert.match(out, /DEBUG\s+"false" => "true"/); // non-secret shown normally
});

test("renderText: differing secrets get different fingerprints (drift stays visible)", () => {
  const d = diff({ token: "a" }, { token: "b" });
  const redact = makeRedactMatcher(true, []);
  const out = renderText(d, { color: false, redact });
  const m = out.match(/«redacted:([0-9a-f]{6})» => «redacted:([0-9a-f]{6})»/);
  assert.ok(m && m[1] !== m[2]);
});

test("redactToken: stable and non-reversible", () => {
  assert.equal(redactToken("x"), redactToken("x"));
  assert.notEqual(redactToken("x"), redactToken("y"));
  assert.doesNotMatch(redactToken("supersecret"), /supersecret/);
});

test("renderJson: --redact masks value and flags redacted:true", () => {
  const d = diff({ api_key: "old" }, { api_key: "new" });
  const redact = makeRedactMatcher(true, []);
  const parsed = JSON.parse(renderJson(d, { redact }));
  assert.equal(parsed.changes[0].redacted, true);
  assert.match(parsed.changes[0].oldValue, /^«redacted:[0-9a-f]{6}»$/);
  assert.doesNotMatch(JSON.stringify(parsed), /"old"|"new"/);
});

test("makeRedactMatcher: custom key glob extends builtins", () => {
  const redact = makeRedactMatcher(true, ["keyboard"]);
  assert.ok(redact(["keyboard"]));   // custom
  assert.ok(redact(["DB_PASSWORD"])); // builtin still active
  assert.ok(!redact(["username"]));
});
