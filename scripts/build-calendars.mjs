// Inlines data/<type>/*.json into src/calendars/<type>/*.generated.ts.
//
// This exists only because importing JSON is not portable: ESM needs import
// attributes, CommonJS and every bundler disagree, and a published package
// cannot rely on any of them. The data is copied verbatim — nothing is
// transformed, derived or reordered, which is what makes
// scripts/check-generated.mjs a meaningful proof.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'src', 'calendars');

/**
 * Venue ids live in one namespace per venue type, never in one shared one.
 *
 * Exchange ids are ISO 10383 MICs — an external registry that gains new codes
 * without our involvement. News service ids are ordinary acronyms. Nothing
 * stops a future MIC from matching a service code we have already shipped, so
 * the type is part of the path and part of the lookup key. Without that, the
 * two would race for the same filename and the same registry entry.
 */
const NAMESPACES = [
  { directory: 'exchanges', type: 'exchange' },
  { directory: 'news-services', type: 'news-service' },
];

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

/** A local binding that stays unique even if two namespaces share an id. */
function bindingName(namespace, venue) {
  return `${venue.id}_${namespace.type.replace(/-/g, '_')}`;
}

export function renderVenueModule(venue, namespace) {
  return [
    '// GENERATED FILE - do not edit.',
    `// Source: data/${namespace.directory}/${venue.id}.json`,
    '// Regenerate with: npm run build:calendars',
    '',
    "import type { VenueData } from '../data.js';",
    '',
    `export const ${venue.id}: VenueData = ${toAsciiLiteral(venue)};`,
    '',
  ].join('\n');
}

export function renderIndexModule(entries) {
  return [
    '// GENERATED FILE - do not edit.',
    '// Regenerate with: npm run build:calendars',
    '',
    "import type { VenueData } from './data.js';",
    ...entries.map(
      ({ venue, namespace }) =>
        `import { ${venue.id} as ${bindingName(namespace, venue)} } from './${namespace.directory}/${venue.id}.generated.js';`,
    ),
    '',
    'export const BUILT_IN_VENUES: readonly VenueData[] = [',
    ...entries.map(
      ({ venue, namespace }) => `  ${bindingName(namespace, venue)},`,
    ),
    '];',
    '',
  ].join('\n');
}

export async function readVenues() {
  const entries = [];

  for (const namespace of NAMESPACES) {
    const directory = join(DATA, namespace.directory);
    const files = (await readdir(directory))
      .filter((file) => file.endsWith('.json'))
      .sort();

    for (const file of files) {
      const venue = JSON.parse(await readFile(join(directory, file), 'utf8'));
      const expected = basename(file, '.json');

      if (venue.id !== expected) {
        throw new Error(
          `data/${namespace.directory}/${file} declares id '${venue.id}' but should declare '${expected}'`,
        );
      }
      if (venue.type !== namespace.type) {
        throw new Error(
          `data/${namespace.directory}/${file} declares type '${venue.type}' but lives in the '${namespace.type}' namespace`,
        );
      }

      entries.push({ venue, namespace });
    }
  }

  return entries;
}

export async function generate() {
  const entries = await readVenues();
  const files = new Map();

  for (const { venue, namespace } of entries) {
    files.set(
      join(OUT, namespace.directory, `${venue.id}.generated.ts`),
      renderVenueModule(venue, namespace),
    );
  }

  files.set(join(OUT, 'built-in.generated.ts'), renderIndexModule(entries));
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await generate();
  for (const [path, contents] of files) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    console.log(`wrote ${path.replace(`${ROOT}/`, '')}`);
  }
}
