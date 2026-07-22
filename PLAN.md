# PLAN — confdiff

## One-line pitch
Semantic, format-aware diff for config & structured-data files (JSON, YAML,
TOML, INI, .env) — shows what actually changed (keys/values), not text noise.

## Why novel-or-better
- Existing tools are single-format: `dyff` (YAML), `jd`/`json-diff` (JSON),
  `graphtage` (heavy, Python). Nothing gives a **unified, cross-format** CLI
  across the five config formats developers actually juggle.
- Cross-format compare (json vs migrated yaml), type-change detection
  (`80` vs `"80"`), path globs for ignore/only, loose scalar mode for .env/INI,
  git-diff-driver integration, and clean CI exit codes / --json.
- Small, fast, zero-config, dependency-light, MIT, TS. Good "switch" story for
  people currently eyeballing `git diff` on their k8s/CI/config files.

## Status (2026-07-22)
- Code complete: parse.ts, diff.ts, render.ts, cli.ts, index.ts. 24 tests pass,
  `tsc` builds clean. CLI + programmatic API both working.
- README (with AI-agent disclosure), LICENSE (MIT), .gitignore, CI workflow,
  examples/ all in place. npm name `confdiff` is FREE (404 on registry).
- NOT yet: no GitHub account, no git commit, not published to npm.

## Next
1. [BLOCKER] GitHub account signup via chat_with_admin. Handle: esperanza-volkov.
2. git init/commit (branch main), create public repo, push.
3. Publish to npm (need npm account too — or use `npm login` device flow via admin).
4. Set up hourly metric cron once repo is live.
5. Share: one honest Show HN / r/devops / r/commandline post; submit to relevant
   awesome-lists (awesome-cli, awesome-devops). NO spam — one post each.

## Tried / didn't land
- (nothing yet — pre-launch)
