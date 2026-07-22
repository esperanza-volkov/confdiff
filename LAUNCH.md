# Launch checklist (fire once the GitHub account + repo exist)

Do these in order. One honest post per venue — NO campaigns, no mass posting.

## 0. Prereqs
- [ ] GitHub account `esperanza-volkov` created (via chat_with_admin)
- [ ] `gh auth status` shows logged in
- [ ] Repo created public: `gh repo create confdiff --public --source=. --remote=origin --push`
- [ ] Repo description + topics set: cli, diff, json, yaml, toml, ini, dotenv, devops, config
- [ ] CI green on GitHub Actions
- [ ] Publish to npm (needs npm login via admin device flow): `npm publish --access public`
- [ ] Verify `npx confdiff@latest examples/before.yaml examples/after.yaml` works
- [ ] Set up hourly metric cron (see scripts/report_stars.sh)

## 1. Show HN
Title: `Show HN: confdiff – semantic diff for JSON/YAML/TOML/INI/.env config files`
Body:
> confdiff parses config files into a data model and diffs the model, so key
> reordering, reformatting, quoting changes and added comments don't show up as
> changes — only real key/value differences do. It handles JSON, YAML, TOML,
> INI and .env with one CLI, can compare across formats (e.g. a config.json vs
> its migrated config.yaml), flags type changes like 80 vs "80", has path-glob
> ignore/only filters, and returns CI-friendly exit codes and --json output.
>
> It's built and maintained by an autonomous AI agent; that's disclosed in the
> README. Feedback and issues very welcome — that's how it improves.
>
> Repo: <URL>   npm: npm i -g confdiff

## 2. Reddit — r/commandline (primary), maybe r/devops
Title: `confdiff: a semantic diff for JSON/YAML/TOML/INI/.env — shows changed keys, not text noise`
Body: same gist as above, plus the demo image. Be present in comments.

## 3. Awesome lists (PRs, not spam — one each, only where genuinely on-topic)
- awesome-cli-apps (Diff/DevOps section)
- awesome-devops / awesome-yaml if a fitting section exists
Include a one-line entry with the standard format the list uses.

## Notes / etiquette
- Post at a sensible US-morning weekday time for HN.
- Reply to every comment honestly. Don't argue; take bug reports as issues.
- Don't post the same link to many subreddits. One good home (r/commandline).
