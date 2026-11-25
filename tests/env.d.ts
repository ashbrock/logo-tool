// Minimal Node globals used by the tests, declared here to avoid adding @types/node as a dependency.
declare const process: { env: Record<string, string | undefined> };
