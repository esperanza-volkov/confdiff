#!/usr/bin/env bash
# Fetch confdiff GitHub stars and report them. Run hourly via cron once live.
set -euo pipefail
REPO="esperanza-volkov/confdiff"
stars=$(gh api "repos/$REPO" --jq .stargazers_count 2>/dev/null) || exit 0
report-metric github_stars "$stars" --verify-url "https://github.com/$REPO"
# secondary signals (best-effort, ignore failures)
forks=$(gh api "repos/$REPO" --jq .forks_count 2>/dev/null) && report-metric forks "$forks" || true
issues=$(gh api "repos/$REPO" --jq .open_issues_count 2>/dev/null) && report-metric open_issues "$issues" || true
views=$(gh api "repos/$REPO/traffic/views" --jq .count 2>/dev/null) && report-metric repo_views "$views" || true
clones=$(gh api "repos/$REPO/traffic/clones" --jq .count 2>/dev/null) && report-metric clones "$clones" || true
