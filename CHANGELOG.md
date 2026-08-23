# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/esperanza-volkov/confdiff/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/esperanza-volkov/confdiff/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/esperanza-volkov/confdiff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/esperanza-volkov/confdiff/releases/tag/v0.1.0
