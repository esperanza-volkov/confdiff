// Bundles the confdiff MCP server into a single self-contained CJS binary
// (dist/mcp.cjs) with esbuild, so the published package keeps a lean runtime
// dependency tree (the MCP SDK + zod are dev-only, bundled in here).
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/mcp.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/mcp.cjs",
  minify: true,
  banner: { js: "#!/usr/bin/env node" },
  define: { __CONFDIFF_VERSION__: JSON.stringify(version) },
});

console.log(`built dist/mcp.cjs (confdiff MCP server v${version})`);
