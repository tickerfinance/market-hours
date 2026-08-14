import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Several tests deliberately sweep large ranges — every second of a trading
    // day, every instant around a DST transition. They run in about a second
    // locally and several times that on a CI runner under coverage
    // instrumentation, which is well past the 5s default.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/calendars/**/*.generated.ts'],
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 95,
      },
    },
  },
});
