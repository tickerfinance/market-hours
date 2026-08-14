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

  // npm may still run lifecycle scripts depending on version and config, and
  // anything they print lands on the same stream as the JSON. Take the array
  // rather than assuming the stream is clean.
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error(`npm pack produced no JSON array:\n${output}`);
  }

  const [result] = JSON.parse(output.slice(start, end + 1)) as [
    { files: { path: string }[] },
  ];
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
    expect(files).toContain('data/exchanges/XLON.json');
    expect(files).toContain('data/news-services/RNS.json');
  });

  it('ships a resolution shim for every venue subpath', () => {
    // These are git-ignored build output, so a broken build would drop them
    // from the tarball in silence. Nothing else here would notice: Node
    // resolves `market-hours/xlon` from the exports map and never reads them.
    // The tools that do are TypeScript under classic `moduleResolution: node`
    // and Jest before 28, neither of which runs in this repository's CI.
    expect(files).toContain('xlon/package.json');
    expect(files).toContain('rns/package.json');
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

  it('ships no images', () => {
    // The README's cover renders from the repository on both GitHub and npm,
    // so shipping it would put 163 kB into every install for nothing. The
    // README quotes a bundle size; the tarball should not undercut it.
    expect(
      files.filter((file) => /\.(png|jpe?g|webp|gif|svg)$/i.test(file)),
    ).toEqual([]);
  });
});
