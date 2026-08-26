#!/usr/bin/env node
// confdiff GitHub Action runner.
// Finds config files changed in a PR/push and shows the *semantic* diff
// (JSON/YAML/TOML/INI/.env/CSV/XML) — not text noise — in the job summary
// and, optionally, as a sticky PR comment.
//
// Dependency-free: shells out to the bundled confdiff.cjs and the git CLI,
// and uses global fetch for the GitHub API.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFDIFF = join(HERE, "confdiff.cjs");
const MARKER = "<!-- confdiff-action -->";

const CONFIG_EXT = new Set([
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".csv", ".tsv", ".xml",
]);

function env(name, dflt = "") {
  const v = process.env[name];
  return v === undefined || v === "" ? dflt : v;
}
function bool(v) {
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}
function trySh(cmd, args, opts = {}) {
  try {
    return { ok: true, out: sh(cmd, args, opts) };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || ""), status: e.status };
  }
}

function readEvent() {
  const p = env("GITHUB_EVENT_PATH");
  if (p && existsSync(p)) {
    try { return JSON.parse(readFileSync(p, "utf8")); } catch { /* ignore */ }
  }
  return {};
}

function resolveBase(event) {
  const override = env("INPUT_BASE");
  if (override) return override;
  if (event.pull_request && event.pull_request.base && event.pull_request.base.sha)
    return event.pull_request.base.sha;
  if (event.before && !/^0+$/.test(event.before)) return event.before;
  // Fallback: previous commit.
  return "HEAD^";
}

function isConfigFile(f) {
  if (basename(f) === ".env") return true;
  return CONFIG_EXT.has(extname(f).toLowerCase());
}

function changedFiles(base, pathspecs) {
  // Files present in both base and head that changed (exclude added/deleted/renamed-away).
  const args = ["diff", "--name-only", "--diff-filter=M", `${base}...HEAD`];
  if (pathspecs.length) args.push("--", ...pathspecs);
  let r = trySh("git", args);
  if (!r.ok) {
    // history may be shallow; fall back to two-dot then to base directly
    r = trySh("git", ["diff", "--name-only", "--diff-filter=M", base, "HEAD",
      ...(pathspecs.length ? ["--", ...pathspecs] : [])]);
  }
  if (!r.ok) return { files: [], warn: "could not compute git diff (checkout with fetch-depth: 0)" };
  const files = r.out.split("\n").map((s) => s.trim()).filter(Boolean).filter(isConfigFile);
  return { files, warn: null };
}

function runConfdiff(oldFile, newFile, extra) {
  const args = [CONFDIFF, oldFile, newFile, "--no-color", ...extra];
  const r = trySh(process.execPath, args);
  return { status: r.ok ? 0 : (r.status ?? 2), out: r.out };
}

async function upsertComment(body, token, event) {
  const pr = event.pull_request;
  const repo = env("GITHUB_REPOSITORY");
  if (!pr || !repo || !token) return { posted: false, reason: "no PR context or token" };
  const [owner, name] = repo.split("/");
  const api = env("GITHUB_API_URL", "https://api.github.com");
  const num = pr.number;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "confdiff-action",
  };
  try {
    const listRes = await fetch(`${api}/repos/${owner}/${name}/issues/${num}/comments?per_page=100`, { headers });
    const comments = listRes.ok ? await listRes.json() : [];
    const existing = Array.isArray(comments) ? comments.find((c) => c.body && c.body.includes(MARKER)) : null;
    const payload = JSON.stringify({ body });
    if (existing) {
      const r = await fetch(`${api}/repos/${owner}/${name}/issues/comments/${existing.id}`, {
        method: "PATCH", headers, body: payload,
      });
      return { posted: r.ok, reason: r.ok ? "updated" : `PATCH ${r.status}` };
    }
    const r = await fetch(`${api}/repos/${owner}/${name}/issues/${num}/comments`, {
      method: "POST", headers, body: payload,
    });
    return { posted: r.ok, reason: r.ok ? "created" : `POST ${r.status}` };
  } catch (e) {
    return { posted: false, reason: String(e && e.message || e) };
  }
}

function setOutput(name, value) {
  const f = env("GITHUB_OUTPUT");
  if (f) appendFileSync(f, `${name}=${value}\n`);
}

async function main() {
  if (!existsSync(CONFDIFF)) {
    console.error(`confdiff bundle missing at ${CONFDIFF}`);
    process.exit(1);
  }
  const event = readEvent();
  const base = resolveBase(event);
  const pathspecs = env("INPUT_PATHS").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const extra = env("INPUT_ARGS").match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const stripped = extra.map((a) => a.replace(/^["']|["']$/g, ""));
  // Redaction is especially important for the Action: a PR comment is public to
  // everyone with repo read access, so leaking a changed secret value there is a
  // real incident. `redact: true` masks secret-looking values as fingerprints.
  if (bool(env("INPUT_REDACT")) && !stripped.includes("--redact")) stripped.push("--redact");

  const { files, warn } = changedFiles(base, pathspecs);

  const tmp = mkdtempSync(join(tmpdir(), "confdiff-"));
  const sections = [];
  let anyDiff = false;
  let errors = 0;

  for (const f of files) {
    const show = trySh("git", ["show", `${base}:${f}`]);
    if (!show.ok) continue; // not present at base (added/renamed) — skip
    const oldPath = join(tmp, "old_" + basename(f));
    writeFileSync(oldPath, show.out);
    const { status, out } = runConfdiff(oldPath, f, stripped);
    if (status === 1) {
      anyDiff = true;
      sections.push(`#### \`${f}\`\n\n\`\`\`diff\n${out.trim()}\n\`\`\``);
    } else if (status === 2) {
      errors++;
      sections.push(`#### \`${f}\`\n\n> ⚠️ ${out.trim() || "parse error"}`);
    }
    // status 0 => text changed but no semantic change: omit to keep report focused.
  }

  let body;
  if (warn) {
    body = `${MARKER}\n## 🧭 confdiff — semantic config diff\n\n> ${warn}`;
  } else if (sections.length === 0) {
    body = `${MARKER}\n## 🧭 confdiff — semantic config diff\n\n✅ No semantic changes in config files.`;
  } else {
    body = `${MARKER}\n## 🧭 confdiff — semantic config diff\n\n${sections.join("\n\n")}\n\n` +
      `<sub>Only meaningful key/value changes are shown — reordered keys, reformatting, comments and quoting are ignored. ` +
      `Powered by [confdiff](https://github.com/esperanza-volkov/confdiff).</sub>`;
  }

  // Job summary
  const summaryFile = env("GITHUB_STEP_SUMMARY");
  if (summaryFile) appendFileSync(summaryFile, body.replace(MARKER + "\n", "") + "\n");
  // Console log too
  console.log(body.replace(MARKER + "\n", ""));

  setOutput("changed", anyDiff ? "true" : "false");

  if (bool(env("INPUT_COMMENT", "true")) && event.pull_request) {
    const res = await upsertComment(body, env("GITHUB_TOKEN"), event);
    if (!res.posted) console.log(`(comment not posted: ${res.reason})`);
  }

  if (errors > 0 && bool(env("INPUT_FAIL_ON_DIFF"))) process.exit(2);
  if (anyDiff && bool(env("INPUT_FAIL_ON_DIFF"))) process.exit(1);
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
