import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The scanner tests launch a real Chromium and load a real page. The default 5s is a
    // browser startup and nothing else.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
