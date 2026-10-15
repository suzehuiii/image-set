import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.tmp/vite',
  test: {
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    passWithNoTests: false,
  },
});
