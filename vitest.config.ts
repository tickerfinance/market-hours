import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/calendars/*.generated.ts'],
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 95,
      },
    },
  },
});
