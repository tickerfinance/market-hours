import { describe, expect, it } from 'vitest';

import { isMarketHoursError } from '../errors.js';
import { epochMsFromZonedParts } from './from-zoned.js';
import { zonedPartsFromEpochMs } from './to-zoned.js';

const HOUR = 3_600_000;
const LONDON = 'Europe/London';

const iso = (ms: number): string => new Date(ms).toISOString();

describe('unambiguous local times', () => {
  it('resolves a winter morning', () => {
    expect(
      iso(
        epochMsFromZonedParts(
          { year: 2026, month: 1, day: 15, hour: 8 },
          LONDON,
        ),
      ),
    ).toBe('2026-01-15T08:00:00.000Z');
  });

  it('resolves a summer morning an hour earlier in UTC', () => {
    expect(
      iso(
        epochMsFromZonedParts(
          { year: 2026, month: 7, day: 15, hour: 8 },
          LONDON,
        ),
      ),
    ).toBe('2026-07-15T07:00:00.000Z');
  });

  it('accepts hour 24 as midnight ending the day', () => {
    expect(
      iso(
        epochMsFromZonedParts(
          { year: 2026, month: 1, day: 15, hour: 24 },
          LONDON,
        ),
      ),
    ).toBe('2026-01-16T00:00:00.000Z');
  });

  it('rejects an impossible calendar date', () => {
    try {
      epochMsFromZonedParts({ year: 2026, month: 2, day: 30 }, LONDON);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) expect(error.code).toBe('INVALID_DATE');
    }
  });
});

// Clocks go forward at 01:00 UTC on the last Sunday in March: 01:00-01:59
// local never happens.
describe.each([
  { year: 2025, day: 30 },
  { year: 2026, day: 29 },
])('spring forward $year-03-$day', ({ year, day }) => {
  const skipped = [
    { hour: 1, minute: 0, second: 0, millisecond: 0 },
    { hour: 1, minute: 30, second: 0, millisecond: 0 },
    { hour: 1, minute: 59, second: 59, millisecond: 999 },
  ];

  it.each(skipped)('$hour:$minute does not exist', (time) => {
    const parts = { year, month: 3, day, ...time };

    // compatible and later shift forward past the gap, earlier shifts back.
    const compatible = epochMsFromZonedParts(parts, LONDON, 'compatible');
    const later = epochMsFromZonedParts(parts, LONDON, 'later');
    const earlier = epochMsFromZonedParts(parts, LONDON, 'earlier');

    expect(compatible).toBe(later);
    // The two instants are an hour apart even though the local times they
    // render are two hours apart, because the offset differs across the gap.
    expect(later - earlier).toBe(HOUR);
    expect(zonedPartsFromEpochMs(later, LONDON).hour).toBe(time.hour + 1);
    expect(zonedPartsFromEpochMs(earlier, LONDON).hour).toBe(time.hour - 1);

    try {
      epochMsFromZonedParts(parts, LONDON, 'reject');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) {
        expect(error.code).toBe('NONEXISTENT_LOCAL_TIME');
        expect(error.details['gapMs']).toBe(HOUR);
      }
    }
  });

  it('leaves the fence posts around the gap alone', () => {
    for (const time of [
      { hour: 0, minute: 59, second: 59, millisecond: 999 },
      { hour: 2, minute: 0, second: 0, millisecond: 0 },
    ]) {
      const parts = { year, month: 3, day, ...time };
      expect(epochMsFromZonedParts(parts, LONDON, 'earlier')).toBe(
        epochMsFromZonedParts(parts, LONDON, 'later'),
      );
      expect(() =>
        epochMsFromZonedParts(parts, LONDON, 'reject'),
      ).not.toThrow();
    }
  });
});

// Clocks go back at 01:00 UTC on the last Sunday in October: 01:00-01:59 local
// happens twice.
describe.each([
  { year: 2025, day: 26 },
  { year: 2026, day: 25 },
])('fall back $year-10-$day', ({ year, day }) => {
  const repeated = [
    { hour: 1, minute: 0, second: 0, millisecond: 0 },
    { hour: 1, minute: 30, second: 0, millisecond: 0 },
    { hour: 1, minute: 59, second: 59, millisecond: 999 },
  ];

  it.each(repeated)('$hour:$minute happens twice', (time) => {
    const parts = { year, month: 10, day, ...time };

    const earlier = epochMsFromZonedParts(parts, LONDON, 'earlier');
    const later = epochMsFromZonedParts(parts, LONDON, 'later');
    const compatible = epochMsFromZonedParts(parts, LONDON, 'compatible');

    expect(later - earlier).toBe(HOUR);
    expect(compatible).toBe(earlier);

    // Both candidates really do render the requested wall clock.
    for (const candidate of [earlier, later]) {
      expect(zonedPartsFromEpochMs(candidate, LONDON)).toMatchObject({
        hour: time.hour,
        minute: time.minute,
        second: time.second,
      });
    }

    try {
      epochMsFromZonedParts(parts, LONDON, 'reject');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) {
        expect(error.code).toBe('AMBIGUOUS_LOCAL_TIME');
        expect(error.details['earlier']).toBe(earlier);
        expect(error.details['later']).toBe(later);
      }
    }
  });

  it('leaves the fence posts around the repeat alone', () => {
    for (const time of [
      { hour: 0, minute: 59, second: 59, millisecond: 999 },
      { hour: 2, minute: 0, second: 0, millisecond: 0 },
    ]) {
      const parts = { year, month: 10, day, ...time };
      expect(() =>
        epochMsFromZonedParts(parts, LONDON, 'reject'),
      ).not.toThrow();
    }
  });
});

describe('round trip', () => {
  it('returns the original instant for every unambiguous sample', () => {
    // Every 37 minutes through 2026 skips past any repeating pattern that a
    // whole-hour step would hide.
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2027, 0, 1);
    const step = 37 * 60_000;

    for (let ms = start; ms < end; ms += step) {
      const parts = zonedPartsFromEpochMs(ms, LONDON);
      const back = epochMsFromZonedParts(parts, LONDON, 'compatible');
      // The repeated hour each October is the one case where an instant is not
      // recoverable from wall-clock components alone.
      if (back !== ms) {
        expect(back).toBe(ms - HOUR);
        expect(parts.month).toBe(10);
      }
    }
  });
});
