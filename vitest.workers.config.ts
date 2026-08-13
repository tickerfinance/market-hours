import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

/**
 * Runs the unit suite inside workerd, the real Cloudflare Workers runtime.
 *
 * This is the strongest portability claim available: if a Node built-in,
 * `process`, `Buffer` or filesystem access had crept in, nothing here would
 * even import. `test/` is excluded because those specs spawn npm and read the
 * repository, which is a Node concern rather than a package concern.
 *
 * No `nodejs_compat` flag: the package must run on a bare Worker.
 */
export default defineConfig({
  test: {
    ...cloudflareTest({
      miniflare: { compatibilityDate: '2025-01-01' },
    }),
    globals: true,
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
