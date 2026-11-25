import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'spike/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 60_000, // property suites run 2,000 cases in CI (VERIFICATION.md §2)
  },
});
