import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * What actually reaches npm.
 *
 * Two failure modes this catches: shipping something that should not be public,
 * and forgetting to ship something consumers need. Both are silent until
 * someone installs the package.
 */
function packedFiles(): string[] {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const [result] = JSON.parse(output) as [{ files: { path: string }[] }];
  return result.files.map((file) => file.path);
}

describe('the published tarball', () => {
  const files = packedFiles();

  it('ships the entry point, its types and the licence', () => {
    expect(files).toContain('package.json');
    expect(files).toContain('LICENSE');
    expect(files).toContain('README.md');
    expect(files).toContain('src/index.ts');
  });

  it('ships the calendars as plain JSON, readable without this package', () => {
    // Someone writing the equivalent in another language should be able to read
    // the same dates straight out of node_modules.
    expect(files).toContain('data/XLON.json');
    expect(files).toContain('data/RNS.json');
  });

  it('ships no tests', () => {
    expect(files.filter((file) => file.endsWith('.test.ts'))).toEqual([]);
  });

  it('ships no build tooling or configuration', () => {
    const unwanted = files.filter(
      (file) =>
        file.startsWith('scripts/') ||
        file.startsWith('test/') ||
        file.startsWith('.github/') ||
        file.startsWith('tsconfig') ||
        file.startsWith('vitest') ||
        file.endsWith('.tsbuildinfo'),
    );
    expect(unwanted).toEqual([]);
  });
});
