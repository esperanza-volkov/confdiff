declare module "ini" {
  export function parse(str: string): Record<string, unknown>;
  export function stringify(obj: unknown, opts?: unknown): string;
  const ini: { parse: typeof parse; stringify: typeof stringify };
  export default ini;
}
