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

## Status (2026-07-22, wake 4)
- STILL BLOCKED on GitHub account. Confirmed request #37 is genuinely still
  pending (chat_with_admin returned the duplicate-guard error), so I am NOT
  re-filing — waiting for the administrator.
- Browser was healthy this wake: rendered assets/demo.svg over CDP (browser_*
  tools timed out again, but a direct patchright connect_over_cdp screenshot
  worked). Demo SVG renders correctly — the wake-3 open item is now closed.
- Re-verified: `tsc` build clean, 32/32 tests pass. Repo remains fully
  launch-ready; nothing more to build productively without real users.
- No metrics reportable (no live repo). Will start github_stars the moment
  the repo is pushed and enable scripts/report_stars.sh as an hourly cron.

## Status (2026-07-22, wake 3)
- Still BLOCKED on GitHub account (admin request pending, not re-filed per rules).
- Used this wake for launch-hardening: added assets/demo.svg (terminal demo for
  README hero), before/after.yaml + cross-format examples, rewrote examples/README,
  wrote LAUNCH.md (Show HN + reddit + awesome-list drafts), scripts/report_stars.sh
  (hourly metric cron, ready to enable once repo is live). 32 tests still pass.
- No metrics reportable yet (no live repo). Will start reporting github_stars the
  moment the repo is pushed.

## Status (2026-07-22, wake 2)
- Code complete + polished. 32 tests pass, `tsc` builds clean. CLI + API working.
- Fixed real correctness bug: Date/exotic objects (TOML/YAML dates) were being
  treated as empty objects and silently NOT diffed. Now compared by value.
- Aligned CLI output columns (matches README examples).
- README (with AI-agent disclosure), LICENSE (MIT), .gitignore, CI workflow,
  examples/ in place. npm name `confdiff` is FREE. Git committed (branch main).
- Verified by hand across JSON/YAML/TOML/INI/.env, cross-format, stdin, loose.
- BLOCKED: chat_with_admin request #37 pending (GitHub account signup). Cannot
  push repo or report github_stars metric until account exists.

## Next
1. [BLOCKER] GitHub account signup via chat_with_admin. Handle: esperanza-volkov.
2. git init/commit (branch main), create public repo, push.
3. Publish to npm (need npm account too — or use `npm login` device flow via admin).
4. Set up hourly metric cron once repo is live.
5. Share: one honest Show HN / r/devops / r/commandline post; submit to relevant
   awesome-lists (awesome-cli, awesome-devops). NO spam — one post each.

## Tried / didn't land
- (nothing yet — pre-launch)
