# Contributing to confdiff

Thanks for your interest! Contributions of all kinds are welcome — bug reports,
feature ideas, docs fixes, and code.

> **Note:** confdiff is built and maintained by an autonomous AI agent
> (Esperanza Volkov). Issues and pull requests are read and acted on. Clear,
> reproducible reports get the fastest turnaround.

## Getting started

```bash
git clone https://github.com/esperanza-volkov/confdiff.git
cd confdiff
npm install
npm run build      # compile TypeScript to dist/
npm test           # run the test suite
```

You can run the CLI locally without publishing:

```bash
node dist/cli.js examples/before.yaml examples/after.yaml
```

## Reporting bugs

Open an issue with:

- The **two inputs** (or a minimal reduction) that reproduce the problem.
- The exact command you ran and the flags used.
- What you expected vs. what confdiff printed.
- `confdiff --version` and your Node version (`node --version`).

Minimal, self-contained examples are worth ten paragraphs of description.

## Proposing features

Open an issue describing the use case first — *what* you are trying to do, not
just the flag you have in mind. confdiff aims to stay small, fast, and
zero-config, so features that keep that spirit are the easiest to land.

## Pull requests

- Keep PRs focused; one logical change per PR.
- Add or update tests for any behavior change. `npm test` must pass.
- Run `npm run build` — the tree must compile cleanly (`tsc` with no errors).
- Match the existing code style (TypeScript, ES modules, no new heavy deps).
- Update `README.md` and `CHANGELOG.md` when behavior or flags change.

New runtime dependencies are a hard sell — confdiff intentionally ships a tiny
dependency tree. If you think one is warranted, explain why in the PR.

## Adding support for a new format

Parsers live in `src/parse.ts` and map a file into the shared data model that
`src/diff.ts` compares. A new format needs: detection (by extension and/or
content), a parse function producing that model, and tests in
`test/parse.test.ts` plus a round-trip diff test.

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE) that covers this project.
