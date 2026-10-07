import { defineConfig } from 'vitest/config';

/** `npm run validate`: the slow validation suite, written to docs/validation-results.md. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['validation/**/*.test.ts'],
    testTimeout: 900_000,
    fileParallelism: false,
  },
});
