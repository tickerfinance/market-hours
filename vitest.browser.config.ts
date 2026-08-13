import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Runs the unit suite in real browser engines.
 *
 * `test/` is excluded: those specs spawn npm and read the repository, which no
 * browser can do and no consumer would ask it to.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
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
