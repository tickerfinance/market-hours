#!/usr/bin/env node
// Fails when any shipped calendar is verified only to a date less than
// `--days` away (default 183, about six months).
//
// A calendar that quietly runs out is the failure mode this package exists to
// prevent, so it should fail here — on a schedule, and again before publishing
// — rather than in a consumer's Worker on New Year's Day.
//
// This lives in a script rather than inline in a workflow because it was
// inline, in two workflows, and both were still reading `data/*.json` after
// the calendars moved into per-type directories. `readdir` returned three
// directory names, none ending in `.json`, so the loop body never ran and both
// guards passed unconditionally for as long as they existed.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, 'data');

/** Jurisdictions hold holidays and have no coverage of their own. */
const VENUE_DIRECTORIES = ['exchanges', 'news-services'];

function parseDays(argv) {
  const flag = argv.find((argument) => argument.startsWith('--days='));
  if (flag === undefined) return 183;
  const days = Number(flag.slice('--days='.length));
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(`--days must be a non-negative number, got "${flag}"`);
  }
  return days;
}

/** @typedef {{ id: string, coverage: { from: string, through: string } }} Calendar */

/** @returns {Promise<Calendar[]>} */
export async function readVenues() {
  const venues = [];
  for (const directory of VENUE_DIRECTORIES) {
    const path = join(DATA, directory);
    for (const file of (await readdir(path)).filter((f) =>
      f.endsWith('.json'),
    )) {
      venues.push(JSON.parse(await readFile(join(path, file), 'utf8')));
    }
  }
  if (venues.length === 0) {
    throw new Error(
      `No calendars found under data/{${VENUE_DIRECTORIES.join(',')}}. ` +
        'That is a broken check, not an empty repository.',
    );
  }
  return venues;
}

/**
 * @param {Calendar[]} venues
 * @param {string} limit  ISO date the calendars must reach.
 * @returns {Calendar[]}
 */
export function stalest(venues, limit) {
  return venues.filter((venue) => venue.coverage.through < limit);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = parseDays(process.argv.slice(2));
  const limit = new Date(Date.now() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const venues = await readVenues();

  for (const venue of venues) {
    const ok = venue.coverage.through >= limit;
    console.log(
      `${venue.id}: verified through ${venue.coverage.through} ${ok ? 'OK' : 'STALE'}`,
    );
  }

  const stale = stalest(venues, limit);
  if (stale.length > 0) {
    console.error(
      `::error::${stale.map((v) => v.id).join(', ')} verified only to a date before ${limit}. ` +
        'Run the calendar refresh and cut a release.',
    );
    process.exit(1);
  }

  console.log(`All ${venues.length} calendars cover at least ${limit}.`);
}
