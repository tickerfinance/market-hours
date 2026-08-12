// Inlines data/*.json into src/calendars/*.generated.ts.
//
// This exists only because importing JSON is not portable: ESM needs import
// attributes, CommonJS and every bundler disagree, and a published package
// cannot rely on any of them. The data is copied verbatim — nothing is
// transformed, derived or reordered, which is what makes
// scripts/check-generated.mjs a meaningful proof.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'src', 'calendars');

/**
 * Escapes every non-ASCII character so the generated file is byte-stable
 * whatever editor, locale or terminal touches it next. Holiday names really do
 * contain a curly apostrophe, and it should not be able to change silently.
 */
function toAsciiLiteral(value) {
  const json = JSON.stringify(value, null, 2);
  let out = '';
  for (const character of json) {
    const code = character.codePointAt(0);
    out += code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : character;
  }
  return out;
}

export function renderVenueModule(venue) {
  return [
    '// GENERATED FILE - do not edit.',
    `// Source: data/${venue.id}.json`,
    '// Regenerate with: npm run build:calendars',
    '',
    "import type { VenueData } from './data.js';",
    '',
    `export const ${venue.id}: VenueData = ${toAsciiLiteral(venue)};`,
    '',
  ].join('\n');
}

export function renderIndexModule(venues) {
  return [
    '// GENERATED FILE - do not edit.',
    '// Regenerate with: npm run build:calendars',
    '',
    "import type { VenueData } from './data.js';",
    ...venues.map(
      (venue) => `import { ${venue.id} } from './${venue.id}.generated.js';`,
    ),
    '',
    'export const BUILT_IN_VENUES: readonly VenueData[] = [',
    ...venues.map((venue) => `  ${venue.id},`),
    '];',
    '',
  ].join('\n');
}

export async function readVenues() {
  const files = (await readdir(DATA))
    .filter((file) => file.endsWith('.json'))
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const venue = JSON.parse(await readFile(join(DATA, file), 'utf8'));
      const expected = basename(file, '.json');
      if (venue.id !== expected) {
        throw new Error(
          `data/${file} declares id '${venue.id}' but should declare '${expected}'`,
        );
      }
      return venue;
    }),
  );
}

export async function generate() {
  const venues = await readVenues();
  const files = new Map();
  for (const venue of venues) {
    files.set(join(OUT, `${venue.id}.generated.ts`), renderVenueModule(venue));
  }
  files.set(join(OUT, 'built-in.generated.ts'), renderIndexModule(venues));
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await generate();
  for (const [path, contents] of files) {
    await writeFile(path, contents);
    console.log(`wrote ${path.replace(`${ROOT}/`, '')}`);
  }
}
