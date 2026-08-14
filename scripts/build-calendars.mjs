// Turns data/<type>/*.json into one importable module per venue, plus the
// resolution shims that make `market-hours/xlon` work on every consumer.
//
// Two reasons this step exists:
//
// 1. Importing JSON is not portable. ESM needs import attributes, CommonJS and
//    every bundler disagree, and a published package cannot rely on any of them.
//
// 2. Each venue must be its own module so a bundler can drop the ones a
//    consumer never imports. A registry that referenced them all would defeat
//    `sideEffects: false` and make everyone pay for every calendar.
//
// The output is a deterministic function of data/, which scripts/check-generated
// .mjs verifies byte for byte.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'src', 'calendars');

/**
 * Venue ids live in one namespace per type, never in one shared one. Exchange
 * ids are ISO 10383 MICs, from a registry that gains codes without our
 * involvement; news service ids are ordinary acronyms. Nothing stops a future
 * MIC from matching a service code already shipped here.
 */
const NAMESPACES = [
  {
    directory: 'exchanges',
    type: 'exchange',
    define: 'defineMarket',
    venue: 'Market',
  },
  {
    directory: 'news-services',
    type: 'news-service',
    define: 'defineService',
    venue: 'Service',
  },
];

/**
 * Bank holidays belong to a jurisdiction, not to a venue. XLON and RNS observe
 * the same England and Wales dates because they are both in England — so the
 * list lives once, in data/jurisdictions/, and each venue names the one it
 * follows.
 *
 * Two things fall out of that. The dates cannot drift between venues, which was
 * previously true only because a test asserted it. And the monthly refresh
 * updates one file rather than one per venue.
 *
 * At runtime `VenueData.holidays` is still a plain array — the sharing is a
 * module boundary, not a type. A bundler importing both venues keeps one copy;
 * one importing a single venue is unaffected.
 */
const JURISDICTIONS = join(DATA, 'jurisdictions');

async function readJurisdictions() {
  const byId = new Map();
  for (const file of (await readdir(JURISDICTIONS)).filter((f) =>
    f.endsWith('.json'),
  )) {
    const data = JSON.parse(await readFile(join(JURISDICTIONS, file), 'utf8'));
    const expected = basename(file, '.json');
    if (data.id !== expected) {
      throw new Error(
        `data/jurisdictions/${file} declares id '${data.id}' but should declare '${expected}'`,
      );
    }
    byId.set(data.id, data);
  }
  return byId;
}

function jurisdictionBinding(id) {
  return id.toUpperCase().replace(/-/g, '_');
}

export function renderJurisdictionModule(jurisdiction) {
  return [
    '// GENERATED FILE - do not edit.',
    `// Source: data/jurisdictions/${jurisdiction.id}.json`,
    '// Regenerate with: npm run build:calendars',
    '',
    "import type { HolidayEntry, SourceEntry } from '../data.js';",
    '',
    `export const ${jurisdictionBinding(jurisdiction.id)}_HOLIDAYS: readonly HolidayEntry[] =`,
    `  ${toAsciiLiteral(jurisdiction.holidays)};`,
    '',
    `export const ${jurisdictionBinding(jurisdiction.id)}_SOURCES: readonly SourceEntry[] =`,
    `  ${toAsciiLiteral(jurisdiction.sources)};`,
    '',
  ].join('\n');
}

/**
 * Compact, not pretty-printed. Cuts the generated JavaScript by roughly 40% and
 * costs nothing: data/ stays human-readable and is the thing anyone reviews.
 *
 * Deliberately no cleverness beyond that. Encoding holidays as tuples, or
 * phases as indices, saves another 40% of raw bytes and only 2% gzipped —
 * because the repetition it removes by hand is what gzip removes for free — and
 * it would make the shipped data unreadable for no real gain.
 */
function toAsciiLiteral(value) {
  const json = JSON.stringify(value);
  let out = '';
  for (const character of json) {
    const code = character.codePointAt(0);
    out += code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : character;
  }
  return out;
}

/**
 * Each venue module exports two things, and which one you reach for is the
 * difference between using this package and changing it.
 *
 * `XLON` is the venue, already built. Importing it is the entire setup, and
 * because it is one module-scope instance every caller shares its day-schedule
 * cache — the thing consumers previously had to know to arrange by hand.
 *
 * `XLON_CALENDAR` is the data behind it, for `defineMarket` when the defaults
 * are wrong: a longer horizon, `strict: false`, a venue-specific correction.
 * That is what `defineMarket` is for, and it is no longer in the way of people
 * who just want an answer.
 *
 * The `#__PURE__` annotation lets a bundler drop the construction for anyone
 * who imports only the data. `defineMarket` validates and can throw, but not on
 * data this repository ships — test/invariants.test.ts is what makes that true.
 */
export function renderVenueModule(venue, namespace, jurisdiction) {
  const binding = jurisdictionBinding(jurisdiction.id);
  const { jurisdiction: _named, sources, ...rest } = venue;
  const body =
    `${toAsciiLiteral(rest).slice(0, -1)},` +
    `"sources":[...${binding}_SOURCES,...${toAsciiLiteral(sources)}],` +
    `"holidays":${binding}_HOLIDAYS}`;

  return [
    '// GENERATED FILE - do not edit.',
    `// Source: data/${namespace.directory}/${venue.id}.json`,
    `//         data/jurisdictions/${jurisdiction.id}.json`,
    '// Regenerate with: npm run build:calendars',
    '',
    `import { ${namespace.define} } from '../../core/define.js';`,
    `import type { ${namespace.venue} } from '../../types.js';`,
    "import type { VenueData } from '../data.js';",
    `import {`,
    `  ${binding}_HOLIDAYS,`,
    `  ${binding}_SOURCES,`,
    `} from '../jurisdictions/${jurisdiction.id}.generated.js';`,
    '',
    '/**',
    ` * The ${venue.name} calendar as data, for {@link ${namespace.define}} when you`,
    ' * need to change something — extend the coverage horizon, turn strict off, or',
    ' * correct a date without waiting for a release.',
    ' */',
    `export const ${venue.id}_CALENDAR: VenueData<'${namespace.type}'> = ${body};`,
    '',
    '/**',
    ` * ${venue.name}, ready to query. Importing it is the whole setup.`,
    ' *',
    ' * ```ts',
    ` * import { ${venue.id} } from 'market-hours/${venue.id.toLowerCase()}';`,
    ` * ${venue.id}.isOpen();`,
    ' * ```',
    ' *',
    ' * One instance for the whole process, so every caller shares its day-schedule',
    ` * cache. Reach for {@link ${namespace.define}} and`,
    ` * {@link ${venue.id}_CALENDAR} only when you need to change how it behaves.`,
    ' */',
    `export const ${venue.id}: ${namespace.venue} = /*#__PURE__*/ ${namespace.define}(${venue.id}_CALENDAR);`,
    '',
  ].join('\n');
}

/**
 * A directory at the package root for each venue, so `market-hours/xlon`
 * resolves under classic `moduleResolution: node` too — which ignores the
 * exports map entirely and looks for a real directory with a package.json.
 * Modern resolvers use the exports map and never see these.
 */
function renderShim(venue, namespace) {
  const target = `calendars/${namespace.directory}/${venue.id}.generated`;
  return `${JSON.stringify(
    {
      name: `market-hours-${venue.id.toLowerCase()}`,
      private: true,
      sideEffects: false,
      main: `../dist/cjs/${target}.js`,
      module: `../dist/esm/${target}.js`,
      types: `../dist/cjs/${target}.d.ts`,
    },
    null,
    2,
  )}\n`;
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

/** The `exports` map entry and `files` entry each venue needs. */
export function manifestFor(entries) {
  const exportsMap = {};
  const files = [];
  for (const { venue, namespace } of entries) {
    const slug = venue.id.toLowerCase();
    const target = `calendars/${namespace.directory}/${venue.id}.generated`;
    exportsMap[`./${slug}`] = {
      import: {
        types: `./dist/esm/${target}.d.ts`,
        default: `./dist/esm/${target}.js`,
      },
      require: {
        types: `./dist/cjs/${target}.d.ts`,
        default: `./dist/cjs/${target}.js`,
      },
    };
    files.push(`${slug}/`);
  }
  return { exportsMap, files };
}

export async function generate() {
  const entries = await readVenues();
  const jurisdictions = await readJurisdictions();
  const files = new Map();

  for (const jurisdiction of jurisdictions.values()) {
    files.set(
      join(OUT, 'jurisdictions', `${jurisdiction.id}.generated.ts`),
      renderJurisdictionModule(jurisdiction),
    );
  }

  for (const { venue, namespace } of entries) {
    const jurisdiction = jurisdictions.get(venue.jurisdiction);
    if (jurisdiction === undefined) {
      throw new Error(
        `data/${namespace.directory}/${venue.id}.json names jurisdiction '${venue.jurisdiction}', which has no data/jurisdictions file`,
      );
    }
    files.set(
      join(OUT, namespace.directory, `${venue.id}.generated.ts`),
      renderVenueModule(venue, namespace, jurisdiction),
    );
    files.set(
      join(ROOT, venue.id.toLowerCase(), 'package.json'),
      renderShim(venue, namespace),
    );
  }

  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = await readVenues();

  // Drop shim directories for venues that no longer exist.
  for (const { venue } of entries) {
    await rm(join(ROOT, venue.id.toLowerCase()), {
      recursive: true,
      force: true,
    });
  }

  const files = await generate();
  for (const [path, contents] of files) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    console.log(`wrote ${path.replace(`${ROOT}/`, '')}`);
  }

  // package.json must list every venue subpath. Checked rather than written, so
  // the manifest stays a reviewed file rather than a generated one.
  const { exportsMap, files: fileEntries } = manifestFor(entries);
  const manifest = JSON.parse(
    await readFile(join(ROOT, 'package.json'), 'utf8'),
  );
  const missing = Object.keys(exportsMap).filter(
    (key) => manifest.exports[key] === undefined,
  );
  const unlisted = fileEntries.filter(
    (entry) => !manifest.files.includes(entry),
  );
  if (missing.length > 0 || unlisted.length > 0) {
    console.error(
      `\npackage.json needs updating:\n` +
        (missing.length > 0
          ? `  exports: add ${missing.join(', ')}\n${JSON.stringify(exportsMap, null, 2)}\n`
          : '') +
        (unlisted.length > 0 ? `  files: add ${unlisted.join(', ')}\n` : ''),
    );
    process.exit(1);
  }
}
