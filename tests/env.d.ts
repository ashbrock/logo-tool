// Minimal Node globals used by the tests, declared here to avoid adding @types/node as a dependency.
declare const process: { env: Record<string, string | undefined> };
declare module 'node:module' {
  export function createRequire(url: string): (id: string) => unknown;
}
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
