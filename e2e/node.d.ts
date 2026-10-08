// The few Node APIs the tests use. (@types/node isn't installed: it would stop the app's own build from
// type-checking src/lib/clientParity.test.ts, which expects these modules to be untyped.)
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
declare module "node:module" {
  export function createRequire(url: string): { resolve(id: string): string };
}
declare const process: { env: Record<string, string | undefined> };
declare class Buffer {
  static from(data: string, encoding: "base64"): Buffer;
}
