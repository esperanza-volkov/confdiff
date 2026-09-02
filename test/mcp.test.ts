import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/mcp.js";

async function connectedClient() {
  const server = buildServer("test");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

test("mcp: exposes diff_configs and diff_config_files", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["diff_config_files", "diff_configs"]);
  await client.close();
});

test("mcp: diff_configs ignores key order, reports real change", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "diff_configs",
    arguments: { a: '{"b":2,"a":1}', b: '{"a":1,"b":3}' },
  });
  assert.equal((res.structuredContent as { changed: boolean }).changed, true);
  assert.equal((res.structuredContent as { count: number }).count, 1);
  await client.close();
});

test("mcp: diff_configs cross-format equivalent => no diff", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "diff_configs",
    arguments: { a: '{"server":{"port":8080}}', b: "server:\n  port: 8080\n", formatB: "yaml" },
  });
  assert.equal((res.structuredContent as { changed: boolean }).changed, false);
  await client.close();
});

test("mcp: diff_configs redact masks secret values", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "diff_configs",
    arguments: {
      a: "password: hunter2\nhost: a",
      b: "password: swordfish\nhost: b",
      formatA: "yaml",
      formatB: "yaml",
      redact: true,
    },
  });
  const text = (res.content as { type: string; text: string }[])[0].text;
  assert.ok(!text.includes("hunter2"), "plaintext secret must not leak");
  assert.ok(!text.includes("swordfish"), "plaintext secret must not leak");
  assert.ok(text.includes("redacted"), "should show a redacted fingerprint");
  assert.ok(text.includes('"a" => "b"') || text.includes("a => b"), "non-secret drift stays visible");
  await client.close();
});

test("mcp: invalid input returns isError, not a crash", async () => {
  const client = await connectedClient();
  const res = await client.callTool({
    name: "diff_configs",
    arguments: { a: "{not valid json", b: "{}", formatA: "json" },
  });
  assert.equal((res as { isError?: boolean }).isError, true);
  await client.close();
});
