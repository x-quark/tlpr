import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://github.com/x-quark/tlpr/issues/1',
      },
    },
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Lifecycle tests wait on real animation frames; coverage instrumentation slows them down.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/styles.d.ts'],
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
      // Regression floor: keep reading and merge behavior covered as GitHub markup evolves.
      thresholds: { statements: 94, branches: 86, functions: 97, lines: 97 },
    },
  },
});
