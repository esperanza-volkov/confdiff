// Minimal browser shim for node:path — only extname is used by parse.ts.
export function extname(p) {
  const i = p.lastIndexOf(".");
  const s = p.lastIndexOf("/");
  return i > s && i > 0 ? p.slice(i) : "";
}
export default { extname };
