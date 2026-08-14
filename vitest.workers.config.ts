import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Runs the suite inside workerd, the real Cloudflare Workers runtime.
 *
 * This is the strongest portability claim available: if a Node built-in,
 * `process`, `Buffer` or filesystem access had crept in, nothing here would
 * even import. No `nodejs_compat` flag — the package must run on a bare Worker.
 *
 * Tests are excluded by what they *need*, never by which directory they live
 * in. Only the two specs that shell out to npm and read the repository are
 * skipped; everything else runs, including the differential suite, which is the
 * single most valuable thing to run here — a different ICU build is exactly
 * where a time-zone implementation diverges.
 */
// Spread over configDefaults.exclude, never in place of it: setting `exclude`
// replaces vitest's defaults outright, and dropping '**/node_modules/**' makes
// it collect every test in every dependency.
export const NODE_BOUND_SPECS = [
  ...configDefaults.exclude,
  'test/packlist.test.ts', // spawns npm
  'test/fixtures.test.ts', // reads the repository
  'test/freshness.test.ts', // reads the repository
];

export default defineConfig({
  test: {
    ...cloudflareTest({
      miniflare: { compatibilityDate: '2025-01-01' },
    }),
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: NODE_BOUND_SPECS,
    testTimeout: 60_000,
  },
});
