import { describe, expect, it } from 'vitest';

import { readVenues, stalest } from '../scripts/check-calendar-freshness.mjs';

/**
 * The guard that stops a stale calendar reaching npm.
 *
 * It was inline in two workflows and silently did nothing for as long as it
 * existed: it read `data/*.json` after the calendars moved into per-type
 * directories, so it iterated an empty list and always passed. A check nobody
 * checks is not a check.
 *
 * Node-bound, because it reads the repository — so it sits beside
 * `packlist.test.ts` in the workerd and browser exclusion lists rather than in
 * `invariants.test.ts`, which has to stay portable.
 */
describe('the freshness guard', () => {
  it('finds the shipped calendars at all', async () => {
    const venues = await readVenues();
    expect(venues.map((venue) => venue.id).sort()).toEqual(['RNS', 'XLON']);
  });

  it('reports nothing stale against a horizon the calendars cover', async () => {
    expect(stalest(await readVenues(), '2027-01-01')).toEqual([]);
  });

  it('reports every venue stale against a horizon beyond them', async () => {
    const stale = stalest(await readVenues(), '2099-01-01');
    expect(stale.map((venue) => venue.id).sort()).toEqual(['RNS', 'XLON']);
  });
});
