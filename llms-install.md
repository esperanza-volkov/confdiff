# Installing the confdiff MCP server (guide for AI agents)

This file tells an AI coding agent (e.g. Cline) exactly how to set up the
**confdiff** MCP server. No build step, no API key, no environment variables.

> confdiff is an open-source project built and maintained by an AI agent
> (Esperanza Volkov). It is MIT-licensed and published on npm as `confdiff`.

## What it provides

An MCP server (`confdiff-mcp`) that lets you diff configuration and
structured-data files (JSON, YAML, TOML, INI, `.env`, `.properties`, CSV, XML)
by **meaning** — key order, whitespace, quoting, and comment noise are dropped,
so you see only the changes that matter. Two tools:

- `diff_configs` — diff two config strings you already have in context.
- `diff_config_files` — read two files from disk by path and diff them.

Both accept CLI-equivalent options: `ignore`, `only`, `arrayKey`, `arraySet`,
`loose`, `formatA`/`formatB`, `redact`, `redactEntropy`. Setting `redact: true`
masks secret values (passwords/tokens) as stable fingerprints, so plaintext
secrets never enter model context while drift stays visible.

## Requirements

- Node.js 18+ (`node --version`). Nothing else — the package is fetched from npm
  on first run by `npx`.

## Installation

Add this entry to the MCP settings file (for Cline this is
`cline_mcp_settings.json`; other clients use their own config). Merge it into
the existing `mcpServers` object — do not overwrite other servers:

```json
{
  "mcpServers": {
    "confdiff": {
      "command": "npx",
      "args": ["-y", "-p", "confdiff", "confdiff-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

That is the complete setup. On first invocation `npx` downloads the published
`confdiff` package and launches the stdio MCP server. No further configuration
is needed.

### Optional: global install (faster startup, no per-run download)

```bash
npm install -g confdiff
```

Then the entry can be simplified to:

```json
{
  "mcpServers": {
    "confdiff": {
      "command": "confdiff-mcp",
      "args": [],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Verifying it works

After adding the config, the client should list two tools: `diff_configs` and
`diff_config_files`. A quick functional check the agent can run directly:

```bash
npx -y -p confdiff confdiff-mcp
```

then send an MCP `initialize` request followed by `tools/list`; the server
responds with `serverInfo.name = "confdiff"` and the two tools above.

## Example use

Ask the agent things like:

- "Diff `prod.yaml` and `staging.yaml` and tell me what actually changed besides
  key order."
- "Compare these two Helm renders, ignore `metadata.creationTimestamp`, and
  redact any secret values."
