# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- XML support (`.xml`, `.xhtml`, `.svg`, `.plist`, `.xsd`): parsed into a nested
  data model and diffed semantically, so re-indentation, attribute reordering,
  and reordered sibling elements are not reported as changes. Attributes are
  keyed with an `@_` prefix, element text is `#text`, and repeated child
  elements become arrays. Scalar values are type-coerced so `<port>80</port>`
  compares equal to a JSON `"port": 80` (cross-format works for XML too).
  Malformed XML fails cleanly with exit code `2`.

## [0.1.0]

Initial release.

### Added

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

[Unreleased]: https://github.com/esperanza-volkov/confdiff/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/esperanza-volkov/confdiff/releases/tag/v0.1.0
