# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0] - 2026-08-27

### Added

- **Container image on GHCR.** A tiny, dependency-free image is now published to
  `ghcr.io/esperanza-volkov/confdiff` on every release, so you can run confdiff
  without a Node.js install:
  `docker run --rm -v "$PWD:/work" ghcr.io/esperanza-volkov/confdiff a.yaml b.yaml`.
  The entrypoint is the CLI, so all flags (`--redact`, `--only`, `--json`, …)
  work unchanged. Built from a single-file esbuild bundle in a multi-stage build.

## [0.9.0] - 2026-08-26

### Added

- **Secret-safe diffs (`--redact`).** Secret-looking values — passwords, tokens,
  API keys — are replaced in the output with a stable, non-reversible fingerprint
  (`«redacted:1a2b3c»`) instead of the raw value. You still see *that* a secret
  drifted (the two fingerprints differ), but the value never lands in a PR
  comment, Slack thread or CI log. Non-secret keys print normally, and an
  unchanged secret is never reported. No other config-diff tool does this.
  - Built-in heuristics match secret-ish key names (`password`, `secret`,
    `token`, `api_key`, `access_key`, `private_key`, `credential`,
    `client_secret`, `passphrase`, `dsn`, …) case- and separator-insensitively,
    but not innocent look-alikes like `keyboard`/`monkey`.
  - `--redact-key <glob>` (repeatable/comma-separated) redacts extra
    keys/paths, using the same globs as `--ignore`/`--only`.
  - `--json` masks the value and adds `"redacted": true` on the change.
- **GitHub Action `redact` input** (`redact: true`) — masks secrets in the PR
  comment, so a changed credential is never posted where repo readers can see it.
- **Playground:** a `🔒 redact secrets` toggle and a `secrets (redacted)` example;
  the redact state is captured in shareable permalinks.

## [0.8.0] - 2026-08-25

### Fixed

- **Java `.properties` files are now parsed correctly.** `.properties` previously
  reused the `.env` parser, which only recognises `=` as a separator — so real
  Spring Boot / log4j / Kafka property lines that use `:` (`server.port: 8080`)
  or whitespace (`logging.level.root WARN`) were **silently dropped**. Comparing
  two such files produced an incomplete diff with no error (a silent miss — the
  worst failure for a diff tool). `.properties` now has a dedicated parser that
  understands all three separators, `#`/`!` comments, backslash line
  continuations, and `\uXXXX` / `\:` / `\\` escapes.

### Added

- `properties` is now a first-class format (`--format properties`), distinct
  from `env`. Auto-detected from the `.properties` extension.

## [0.7.0] - 2026-08-25

### Fixed

- **The git diff driver now actually works.** git invokes an external diff
  command with 7 positional arguments (`path old-file old-hex old-mode new-file
  new-hex new-mode`), so the previously-documented `confdiff --exit-zero` failed
  every time with `expected exactly 2 inputs, got 7` — meaning `git diff` on a
  tracked config file died with `fatal: external diff died`. Added a dedicated
  `--git-diff-driver` mode that consumes git's 7 arguments, maps `old-file` /
  `new-file` to the two inputs, detects the format from the real `path` (git's
  temp files have no extension), prints a `confdiff <path>` header, and always
  exits 0 so git never aborts the diff. Reorder-only changes now correctly show
  *no semantic changes*.

### Added

- **`confdiff install-git-driver`** — one-command setup for the git diff driver.
  Sets `diff.confdiff.command` and adds the common config patterns to
  `.gitattributes` (`--global` wires up every repo, honouring
  `core.attributesFile`). Idempotent, accepts custom patterns, never duplicates
  existing lines.

## [0.6.1] - 2026-08-25

### Fixed

- **`--ignore` / `--only` now accept the bracket array-index notation the tool
  itself prints.** Changes are rendered with paths like `items[0].name`, but
  pasting that exact string (or the wildcard `items[*].name`) into `--ignore`
  previously did nothing — only the dot form `items.0.name` matched, because the
  glob matcher split solely on `.`. Patterns are now tokenized understanding both
  `foo[0]`/`foo[*]`/`foo[**]` and `foo.0`/`foo.*`, so a printed array path is
  round-trippable straight back into `--ignore`/`--only`. Same round-trip fix as
  0.6.0's dotted-key work, for the array case. Dot-form patterns and all wildcard
  semantics are unchanged.

## [0.6.0] - 2026-08-25

### Fixed

- **`--ignore` / `--only` can now target keys that themselves contain dots.**
  Real-world configs have such keys — Kubernetes annotations/labels
  (`app.kubernetes.io/name`), log4j-style properties, etc. Previously the tool
  printed a path like `metadata.annotations.app.kubernetes.io/version` but
  pasting that exact string back into `--ignore` silently did nothing, because
  the glob split on every `.`. A run of literal pattern segments is now joined
  to match a single dotted key, so the tool's own printed path is round-trippable
  into `--ignore`/`--only`. Wildcard (`*`/`**`/`?`) semantics are unchanged.
- **`--json` `pointer` is now RFC 6901 compliant.** A `/` inside a key (e.g. the
  annotation `app.kubernetes.io/name`) is escaped to `~1` and a literal `~` to
  `~0`, so the emitted JSON Pointer is unambiguous and works with any standard
  JSON Pointer consumer (jq, patch appliers, etc.).

## [0.5.1] - 2026-08-25

### Fixed

- **`+0` and `-0` are treated as equal.** JSON/YAML can carry a negative zero
  (`-0`); comparing it against `0` previously reported a useless `0 => 0` change.
  Numeric zero now compares equal regardless of sign, while `NaN == NaN` (from
  YAML `.nan`) is still preserved and `NaN` vs a number is still a real change.

## [0.5.0] - 2026-08-25

### Fixed

- **Large integers are compared losslessly (no more silent false "no
  differences").** Integers beyond JavaScript's safe range (`|n| > 2^53-1`) —
  64-bit counters, Discord/Twitter "snowflake" IDs — used to parse to the same
  rounded float, so two *different* IDs compared **equal**, the worst failure
  mode for a diff tool. They are now preserved exactly (as `BigInt`) for JSON,
  YAML and TOML, so a real change is always reported. Ordinary safe-range
  numbers keep their usual type, so nothing else changes and cross-format
  compares still line up. In `--json` output big integers are emitted as precise
  decimal strings.
- **TOML files with large integers no longer crash.** The TOML parser rejected
  any integer it couldn't represent losslessly (exit 2); confdiff now parses
  them as `BigInt` and diffs them normally.
- **YAML merge keys (`<<`) from anchors are now resolved.** A document using
  `<<: *anchor` (Rails `database.yml`, GitLab CI `extends`-style configs) is now
  compared by its *effective* merged content instead of showing a phantom `<<`
  key — so it compares equal to the same config written out in full.

## [0.4.1] - 2026-08-25

### Fixed

- **Empty files no longer crash and behave consistently across formats.** An
  empty or whitespace-only input is now treated as an empty document (`{}`, or
  `[]` for CSV) for every format. Previously empty JSON threw a parse error
  (exit 2) while other formats did not, and empty YAML rendered an awkward
  `null => {...}` type change. Now `confdiff empty.json full.json` cleanly
  reports every key as added — matching how a git diff driver sees a
  newly-added or just-emptied config file.

## [0.4.0] - 2026-08-25

### Added

- **Multi-document YAML support:** YAML files containing multiple documents
  separated by `---` (Kubernetes manifests, `kubectl get -o yaml` output, Helm
  renders) are now parsed into a list of documents and compared per-document,
  instead of failing with a "Source contains multiple documents" error.
  Single-document files are unchanged, and cosmetic trailing/empty separators do
  not create phantom diffs.

## [0.3.0] - 2026-08-23

### Added

- **Intra-segment glob wildcards** in `--ignore`/`--only`: within a path segment,
  `*` matches any run of characters and `?` matches a single character, so
  patterns like `*_SECRET`, `db_*` and `item?` now work (previously `*` only
  matched a whole segment). Cross-segment `*`/`**` behaviour is unchanged.
- **README "Recipes" section**: copy-pasteable workflows for Kubernetes manifest
  drift, `.env` across environments, format-migration checks, dependency-bump
  review, CI drift gates, and keyed CSV/TSV comparison.
- **Shareable playground links**: the playground's "🔗 Share this diff" button
  encodes both inputs and the options (formats, loose, arrays-as-sets) into the
  URL hash and copies a link to the clipboard. Opening the link reproduces the
  exact diff — nothing is sent to a server. Handy for bug reports and reviews.
- **Open Graph / Twitter Card preview** for the playground so shared links render
  a rich card (1200×630 image + description) instead of a bare URL.

## [0.2.0] - 2026-08-20

### Added

- **GitHub Action** (`esperanza-volkov/confdiff@v1`): drop confdiff into any PR
  workflow to post a single sticky comment showing the *semantic* diff of every
  changed JSON/YAML/TOML/INI/`.env`/CSV/XML config file — reformatting, key
  reordering, comments and quoting are ignored. Inputs: `paths`, `args`, `base`,
  `comment`, `fail-on-diff`, `github-token`; output: `changed`. Dependency-free
  composite action wrapping a bundled build of the CLI. See the README.
- **In-browser playground** (<https://esperanza-volkov.github.io/confdiff/>):
  paste two configs and see the semantic diff live. The format-agnostic core is
  bundled to run 100% client-side — nothing is uploaded. Deployed to GitHub Pages.
- **Install-from-GitHub** without npm: a `prepare` script builds the CLI on
  install, so `npm i -g github:esperanza-volkov/confdiff` works directly.

## [0.1.0] - 2026-08-19

Initial release.

### Added

- XML support (`.xml`, `.xhtml`, `.svg`, `.plist`, `.xsd`): parsed into a nested
  data model and diffed semantically, so re-indentation, attribute reordering,
  and reordered sibling elements are not reported as changes. Attributes are
  keyed with an `@_` prefix, element text is `#text`, and repeated child
  elements become arrays. Scalar values are type-coerced so `<port>80</port>`
  compares equal to a JSON `"port": 80` (cross-format works for XML too).
  Malformed XML fails cleanly with exit code `2`.

- Semantic, format-aware diff across JSON, YAML, TOML, INI, and `.env` files —
  compares the parsed data model, so reordered keys, reflowed arrays, quoting
  changes, comments, and indentation are not reported as changes.
- CSV/TSV support: files are parsed into rows keyed by the header and compared
  by position by default; delimiter is auto-detected (`,` `\t` `;` `|`) and
  RFC-4180 quoting (quoted delimiters, embedded newlines, `""` escapes) is
  handled. `--csv-key <column>` matches rows by a key column instead of by
  position, so reordered or inserted rows don't produce spurious changes.
- Cross-format comparison (e.g. diff a JSON file against its migrated YAML
  equivalent).
- Type-change detection (`80` vs `"80"`) surfaced distinctly from value changes.
- Path globs for `--ignore` and `--only` to scope which keys are compared.
- Loose scalar mode (`--loose`): compares scalars across types, so `"3"` equals
  `3` and `"true"` equals `true` — handy for `.env`/INI where everything is text.
- Array-as-set comparison mode.
- `--json` machine-readable output and `--quiet` mode.
- CI-friendly exit codes (`0` = no differences, `1` = differences found).
- Git external diff-driver integration.

[Unreleased]: https://github.com/esperanza-volkov/confdiff/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/esperanza-volkov/confdiff/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/esperanza-volkov/confdiff/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/esperanza-volkov/confdiff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/esperanza-volkov/confdiff/releases/tag/v0.1.0
