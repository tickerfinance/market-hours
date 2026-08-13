import { describe, expect, it } from 'vitest';

import { getMarket, toZonedParts } from '../src/index.js';

/**
 * An independent oracle.
 *
 * The implementation reads `formatToParts` in `en-US`. This reads `format` in
 * `sv-SE`, which renders an ISO-like string. Different method, different
 * locale, different code path inside ICU — so agreement across hundreds of
 * thousands of instants is evidence rather than tautology.
 */
function oracle(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date(epochMs))
    .replace(' ', 'T');
}

function underTest(epochMs: number, timeZone: string): string {
  const parts = toZonedParts(epochMs, timeZone);
  const pad = (value: number, width = 2): string =>
    String(value).padStart(width, '0');
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour,
  )}:${pad(parts.minute)}:${pad(parts.second)}`;
}

const ZONES = [
  'Europe/London',
  'America/New_York',
  'Asia/Kolkata',
  'Pacific/Chatham',
  'Australia/Lord_Howe',
];

describe('agreement with an independent oracle', () => {
  it.each(ZONES)('matches across a decade of instants in %s', (zone) => {
    // A 97-minute step never lands on the same wall-clock minute twice in a
    // row, so it sweeps the whole day repeatedly rather than sampling a slice.
    const start = Date.UTC(2019, 0, 1);
    const end = Date.UTC(2031, 0, 1);
    const step = 97 * 60_000;

    let checked = 0;
    for (let ms = start; ms < end; ms += step) {
      expect(underTest(ms, zone)).toBe(oracle(ms, zone));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50_000);
  });

  it.each([
    '2025-03-30',
    '2025-10-26',
    '2026-03-29',
    '2026-10-25',
    '2027-03-28',
    '2027-10-31',
  ])('matches every second around the London transition on %s', (date) => {
    const transition = Date.parse(`${date}T01:00:00Z`);
    for (
      let ms = transition - 1_800_000;
      ms <= transition + 1_800_000;
      ms += 1000
    ) {
      expect(underTest(ms, 'Europe/London')).toBe(oracle(ms, 'Europe/London'));
    }
  });
});

describe('phase is a total, monotonic function of the instant', () => {
  const lse = getMarket('XLON');

  it('never leaves an instant unclassified across a full year', () => {
    // Every 7 minutes through 2026, including both DST weekends and every
    // holiday and half day in the calendar.
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2027, 0, 1);
    const valid = new Set([
      'closed',
      'pre-open-auction',
      'open',
      'closing-auction',
    ]);

    for (let ms = start; ms < end; ms += 7 * 60_000) {
      expect(valid.has(lse.getStatus(ms).phase)).toBe(true);
    }
  });

  it('agrees with its own nextTransition when walked forward for a year', () => {
    // Walking the transitions must visit exactly the same phases as sampling
    // the instants either side of each one.
    let cursor = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2027, 0, 1);
    let steps = 0;

    while (cursor < end) {
      const transition = lse.nextTransition(cursor);
      const at = transition.at.getTime();
      expect(at).toBeGreaterThan(cursor);
      expect(lse.getStatus(at - 1).phase).toBe(transition.from);
      expect(lse.getStatus(at).phase).toBe(transition.to);
      expect(transition.from).not.toBe(transition.to);
      cursor = at;
      steps += 1;
    }

    // Roughly four boundaries on each of ~250 trading days.
    expect(steps).toBeGreaterThan(900);
  });
});
