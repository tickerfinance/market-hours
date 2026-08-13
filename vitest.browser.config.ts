import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Runs the suite in real browser engines.
 *
 * Excluded by capability, never by directory: only the two specs that shell out
 * to npm and read the repository are skipped. Everything else runs, and the
 * host-timezone spec is especially worth having here — in a browser the host
 * zone is the reader's own machine rather than whatever CI was set to.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Spread over the defaults, never in place of them — replacing `exclude`
    // drops '**/node_modules/**' and collects every dependency's tests.
    exclude: [
      ...configDefaults.exclude,
      'test/packlist.test.ts',
      'test/fixtures.test.ts',
    ],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
});
