import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Not `import.meta.dirname`: that arrived in Node 20.11 and the support matrix
// starts at Node 18.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'typecheck');

/**
 * The consumer fixtures differ only in their tsconfig — the source they compile
 * must stay identical, or a tsconfig shape could silently stop exercising part
 * of the API.
 */
describe('consumer typecheck fixtures', () => {
  const fixtures = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('covers every consumer shape we claim to support', () => {
    expect(fixtures).toEqual([
      'cjs-node16',
      'es5-target',
      'ts48',
      'verbatim-bundler',
    ]);
  });

  it('compiles byte-identical source in each', () => {
    const sources = fixtures.map((fixture) =>
      readFileSync(join(ROOT, fixture, 'index.ts'), 'utf8'),
    );
    for (const source of sources) expect(source).toBe(sources[0]);
  });

  it('depends on the package itself rather than a path alias', () => {
    // Resolving through node_modules is the point: it exercises the exports map
    // exactly as a real consumer would.
    for (const fixture of fixtures) {
      const manifest = JSON.parse(
        readFileSync(join(ROOT, fixture, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      expect(manifest.dependencies?.['market-hours']).toBe('file:../../..');
    }
  });
});
