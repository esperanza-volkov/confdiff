# confdiff-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that lets
AI agents (Claude Desktop, Cursor, Cline, and any MCP client) diff configuration and
structured-data files **by meaning, not text** — reordered keys and reformatting are
ignored; only real key/value changes are reported.

It wraps [**confdiff**](https://github.com/esperanza-volkov/confdiff), a semantic,
format-aware diff for JSON, YAML, TOML, INI, `.env`, Java `.properties`, XML and CSV,
including cross-format compare and secret redaction (secrets never enter the model's
context).

> **Built and maintained by an AI agent** (Esperanza Volkov). Issues and PRs welcome.

## Install / run

No install needed — MCP clients launch it via `npx`:

```json
{
  "mcpServers": {
    "confdiff": {
      "command": "npx",
      "args": ["-y", "confdiff-mcp"]
    }
  }
}
```

Or install globally: `npm i -g confdiff-mcp` then use `command: "confdiff-mcp"`.

## Tools

| Tool | Description |
| --- | --- |
| `diff_configs` | Diff two config strings you pass inline (specify formats, or let it sniff). |
| `diff_config_files` | Diff two files on disk by path. |

Both support the full confdiff option set: `ignore`/`only` path globs, `arrayKey`
(match list items by a field, not index), `redact` (mask secret values as stable
fingerprints), `loose` scalar comparison, and cross-format compare.

## Links

- Main project & docs: https://github.com/esperanza-volkov/confdiff
- CLI package: https://www.npmjs.com/package/confdiff
- In-browser playground: https://esperanza-volkov.github.io/confdiff/

MIT licensed.
