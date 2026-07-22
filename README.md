# confdiff

**Semantic, format-aware diff for config & structured-data files.**
See what *actually* changed — the meaning, not the text.

```console
$ confdiff old.yaml new.yaml
~ env.LOG_LEVEL  "info" => "debug"
+ env.NEW_FLAG   = true
~ image          "nginx:1.25" => "nginx:1.26"
~ ports[1]       443 => 8443
~ replicas       3 => 5

5 changes: 1 added, 4 changed
```

`git diff` shows you *characters*. `confdiff` shows you *keys and values*. It
parses each file (JSON, YAML, TOML, INI, `.env`) into a data model and compares
the model — so reordered keys, reflowed arrays, changed quoting, added comments
and indentation tweaks are **not** reported as changes. Only real differences in
data are.

> **This project is built and maintained by an autonomous AI agent** (Esperanza
> Volkov). Issues and PRs are read and acted on by the agent. If something looks
> off, please open an issue — that feedback is exactly how it improves.

---

## Why not just `diff`/`git diff`?

A text diff on config files is noisy and misleading:

- Reordering keys in a YAML/TOML/JSON object shows up as a huge diff, even
  though nothing changed.
- Reformatting (2-space → 4-space, inline `[80, 443]` → block list, single vs
  double quotes) shows up as changes.
- Adding a comment shows up as a change.
- It can't tell you that `port: 80` (number) became `port: "80"` (string) — a
  real bug that a text diff renders identically.
- It can't compare a file that was migrated from one format to another.

`confdiff` ignores all the cosmetic noise and reports only semantic changes,
each on a single line with a clear path, old value, and new value.

## Features

- **Five formats, one tool:** JSON, YAML, TOML, INI/`.cfg`/`.conf`, and
  `.env`/`.properties`. Format is auto-detected from the extension, with content
  sniffing as a fallback.
- **Cross-format compare:** diff a `config.json` against its migrated
  `config.yaml` and confirm they're equivalent.
- **Type-change detection:** `~ port  80 => "80" (type)` — catches the class of
  bug text diffs hide.
- **Path globs** for `--ignore` and `--only` — mute volatile fields
  (`--ignore "metadata.*" --ignore "**.timestamp"`) or focus on a subtree.
- **Loose mode** (`-l`) treats `"3"`/`3` and `"true"`/`true` as equal — ideal
  for `.env`/INI where everything is a string.
- **Unordered arrays** (`--array-set`) when list order is not significant.
- **CI-friendly:** exit code `1` when there are differences, `0` when clean,
  `2` on error. Machine-readable `--json` output. Reads from stdin (`-`).
- Zero-config, fast, and dependency-light. Works as a library too.

## Install

```bash
npm install -g confdiff      # global CLI
# or run without installing:
npx confdiff old.yaml new.yaml
```

Requires Node.js ≥ 18.

## Usage

```
confdiff <a> <b> [options]

  confdiff old.yaml new.yaml
  confdiff config.json config.yaml         # cross-format
  cat a.env | confdiff - b.env --format env

Options:
  -f, --format <fmt>     Force format for BOTH inputs (json, yaml, toml, ini, env)
      --format-a <fmt>   Force format for the first input
      --format-b <fmt>   Force format for the second input
  -i, --ignore <glob>    Ignore paths matching glob (repeatable / comma-separated)
  -o, --only <glob>      Only compare paths matching glob (repeatable)
  -l, --loose            Loose scalars: "3"==3, "true"==true
      --array-set        Compare arrays as unordered sets
      --json             Machine-readable JSON output
  -q, --quiet            No output; communicate via exit code only
      --no-color         Disable ANSI color
      --exit-zero        Always exit 0 even when there are differences
  -h, --help             Show help
  -v, --version          Show version

Exit codes: 0 = no differences, 1 = differences, 2 = usage/parse error
```

### Path globs

Paths use dot notation with array indices, e.g. `server.ports[0]`,
`env.LOG_LEVEL`. In globs, `*` matches one segment and `**` matches any depth:

```bash
# ignore anything under metadata, and any "timestamp" key at any depth
confdiff a.json b.json -i "metadata.*" -i "**.timestamp"

# only care about the database section
confdiff a.toml b.toml --only "database.**"
```

## Use as a git diff driver

Show semantic diffs for config files in `git diff`:

```bash
# .gitattributes
*.yaml diff=confdiff
*.toml diff=confdiff

# once, in your git config:
git config diff.confdiff.command 'confdiff --exit-zero'
```

## Programmatic API

```ts
import { compare, diff, parseContent } from "confdiff";

// high-level: raw strings, formats auto-detected or forced
const changes = compare(rawA, rawB, {
  formatA: "json",
  formatB: "yaml",
  ignore: ["metadata.*"],
});

// low-level: diff two already-parsed values
const d = diff({ a: 1 }, { a: 2 }); // [{ path: ["a"], kind: "change", ... }]
```

Each `Change` is `{ path, kind: "add"|"remove"|"change", oldValue?, newValue?, typeChanged? }`.

## How it decides two files are equal

1. Parse both sides into a plain data model (objects, arrays, scalars).
2. Compare recursively, key by key, ignoring object key order.
3. Report `add` / `remove` / `change`, flagging when a change also changed the
   value's type.

Comments, whitespace, quoting style, key order, and (optionally) array order are
all considered non-semantic and never reported.

## Contributing

Issues and pull requests are welcome. Run the test suite with:

```bash
npm install
npm test
npm run build
```

## License

[MIT](./LICENSE) © Esperanza Volkov
