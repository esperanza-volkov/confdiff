import { matchAnyGlob, type Path } from "./diff.js";

/**
 * Secret-safe diffs. When enabled, values at "sensitive" paths (passwords,
 * tokens, API keys, …) are replaced in the output with a stable, non-reversible
 * fingerprint — `«redacted:ab12cd»` — instead of the raw value. This lets you
 * paste a config diff into a PR, a Slack thread or a CI log to prove *what
 * drifted* without ever leaking the credential itself. Because the fingerprint
 * is derived from the value, a reader can still see that old and new differ (the
 * two fingerprints won't match), but can't recover either one.
 *
 * No other config-diff tool does this; it's the reason `confdiff --redact` is
 * safe to run in shared/automated contexts on real secrets-bearing files
 * (`.env`, `application.properties`, Helm values, k8s Secrets, …).
 */

/**
 * Built-in heuristics for "this key holds a secret". Matched against the LAST
 * path segment (the key name), case-insensitively, after stripping separators.
 * Deliberately conservative: whole-token indicators so `key` matches but
 * `keyboard`/`monkey` don't, and `pass`-family words are anchored.
 */
const SECRET_TOKENS = [
  "password",
  "passwd",
  "passphrase",
  "pwd",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "secretkey",
  "privatekey",
  "signingkey",
  "encryptionkey",
  "credential",
  "credentials",
  "clientsecret",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "bearer",
  "dsn",
];

/** A separator-insensitive view of a key: `DB_PASSWORD` / `db-password` / `dbPassword` -> tokens. */
function keyTokens(seg: string): string[] {
  return seg
    // split camelCase / PascalCase into words
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Does a key name look like it holds a secret, by built-in heuristics? */
export function looksSecret(seg: string): boolean {
  const words = keyTokens(seg);
  if (words.length === 0) return false;
  const joined = words.join("");
  // Multi-word combined forms: apikey, accesstoken, clientsecret, privatekey…
  if (SECRET_TOKENS.includes(joined)) return true;
  for (const w of words) {
    if (SECRET_TOKENS.includes(w)) return true;
    // standalone "key" is a secret indicator only next to auth-ish words
    if (w === "key" && words.some((x) => ["api", "access", "secret", "private", "signing", "encryption"].includes(x)))
      return true;
  }
  return false;
}

/**
 * Shannon entropy (bits per character) of a string. A uniformly random
 * high-entropy string (API key, JWT, base64 token) scores high (~4–6);
 * repetitive or natural-language text scores low.
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let e = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

/**
 * Content-based secret heuristic: does a VALUE *look* like a random credential,
 * regardless of its key name? Catches secrets stored under non-obvious keys
 * (`x`, `data`, `value`) that the key-name heuristics miss.
 *
 * Deliberately conservative to avoid masking ordinary config: only long,
 * whitespace-free, tokenish strings with high per-character entropy qualify.
 * This *complements* the key-name heuristics — it does NOT replace them: a
 * short weak password like `Letmein` under a `password:` key has low entropy
 * and is only caught by the key-name check, while a 40-char API token under a
 * bland key is only caught here. Enable both for the widest coverage.
 */
export function looksHighEntropy(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  // Secrets are long and contiguous; prose/paths/URLs with spaces are not.
  if (s.length < 20 || /\s/.test(s)) return false;
  // Restrict to the character set of tokens/keys/base64/hex (avoids flagging
  // long prose-y identifiers, sentences joined by punctuation, etc.).
  if (!/^[A-Za-z0-9+/=_.\-:]+$/.test(s)) return false;
  // Require a mix of character classes so a long all-lowercase word or a run of
  // digits (phone/id) isn't mistaken for a random secret.
  const classes =
    Number(/[a-z]/.test(s)) + Number(/[A-Z]/.test(s)) + Number(/[0-9]/.test(s)) + Number(/[+/=_.\-:]/.test(s));
  if (classes < 2) return false;
  return shannonEntropy(s) >= 3.5;
}

export interface RedactMatcher {
  (path: Path, value?: unknown): boolean;
}

/**
 * Build a predicate deciding whether a given path's VALUE should be redacted.
 * @param builtins  use the built-in secret-key heuristics
 * @param globs     extra key-name substrings / path globs (matched via matchAnyGlob)
 * @param entropy   also redact values that *look* like high-entropy secrets,
 *                  regardless of key name (complements, doesn't replace, the above)
 */
export function makeRedactMatcher(builtins: boolean, globs: string[], entropy = false): RedactMatcher {
  return (path: Path, value?: unknown): boolean => {
    if (globs.length && matchAnyGlob(path, globs)) return true;
    if (builtins && path.length > 0) {
      const last = path[path.length - 1];
      if (typeof last === "string" && looksSecret(last)) return true;
    }
    if (entropy && looksHighEntropy(value)) return true;
    return false;
  };
}

/**
 * cyrb53 — a fast, well-distributed 53-bit string hash. Pure JS with no
 * dependencies, so the CLI, the GitHub Action bundle and the browser playground
 * all compute the SAME fingerprint (node:crypto isn't available in the browser).
 * We surface only the low 24 bits (6 hex chars): enough to make a *changed*
 * value obvious (the two tokens differ) while truncation keeps it
 * non-reversible — you can't recover the value from the fingerprint.
 */
function cyrb53(str: string, seed = 0x9e3779b9): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Stable, non-reversible fingerprint of a value. Equal values -> equal token,
 * so an *unchanged* redacted value never shows up as a spurious diff, while a
 * *changed* one shows two visibly different tokens.
 */
export function redactToken(v: unknown): string {
  if (v === undefined) return "«redacted»";
  const s =
    typeof v === "string"
      ? v
      : JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
  const h = (cyrb53(s ?? "null") & 0xffffff).toString(16).padStart(6, "0");
  return `«redacted:${h}»`;
}
