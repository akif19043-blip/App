import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests boot a real server and play a raid.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
