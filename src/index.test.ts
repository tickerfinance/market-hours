import { afterEach, describe, expect, it, vi } from 'vitest';

import { XLON } from './calendars/exchanges/XLON.generated.js';
import { RNS } from './calendars/news-services/RNS.generated.js';
import * as api from './index.js';
import type { VenueData } from './index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the public surface', () => {
  it('exports exactly these names', () => {
    // A snapshot of the API. Adding an export is a minor release; removing or
    // renaming one is a major. Either way it should be a deliberate edit here.
    expect(Object.keys(api).sort()).toEqual([
      'MarketHoursError',
      'defineMarket',
      'defineService',
      'fromZonedParts',
      'getTimeZoneOffsetMs',
      'getTimeZoneSupport',
      'isMarketHoursError',
      'toEpochMs',
      'toZonedParts',
    ]);
  });

  it('ships no venue registry, so a bundler can drop unused calendars', () => {
    // The entry point must not reference any calendar. If it did, importing
    // `defineMarket` would drag in every venue this package ships and
    // `sideEffects: false` could not save anyone.
    //
    // Every export is a function or the error class — no data, and nothing
    // that closes over a calendar.
    for (const [name, value] of Object.entries(api)) {
      expect(typeof value, `${name} should be a function`).toBe('function');
    }
  });
});

describe('defining a venue', () => {
  it('builds an exchange from shipped data', () => {
    const lse = api.defineMarket(XLON);
    expect(lse.id).toBe('XLON');
    expect(lse.type).toBe('exchange');
    expect(lse.isOpen('2026-01-15T12:00:00Z')).toBe(true);
  });

  it('builds a news service from shipped data', () => {
    const rns = api.defineService(RNS);
    expect(rns.id).toBe('RNS');
    expect(rns.isOpen('2026-01-15T18:00:00Z')).toBe(true);
  });

  it('rejects a definition whose type does not match', () => {
    expect(() => api.defineService(XLON)).toThrowError(
      /type must be 'news-service'/,
    );
    expect(() => api.defineMarket(RNS)).toThrowError(/type must be 'exchange'/);
  });

  it('rejects something that is not a definition at all', () => {
    for (const value of [null, undefined, 'XLON', 42]) {
      expect(() =>
        api.defineMarket(value as unknown as VenueData),
      ).toThrowError(/definition object is required|type must be/);
    }
  });

  it('rejects a malformed definition', () => {
    const bad =
      (patch: Partial<VenueData>): (() => unknown) =>
      () =>
        api.defineMarket({ ...XLON, ...patch });

    expect(bad({ id: 'lowercase' })).toThrowError(/uppercase/);
    expect(bad({ sessions: [] })).toThrowError(/at least one session/);
    expect(
      bad({ coverage: { from: 'nope', through: '2026-12-31' } }),
    ).toThrowError(/coverage.from/);
    expect(
      bad({ sessions: [{ phase: 'open', start: '16:00', end: '09:30' }] }),
    ).toThrowError(/ending at or before it starts/);
    expect(
      bad({ holidays: [{ date: '2026-13-01', name: 'Nope' }] }),
    ).toThrowError(/holiday date/);
    expect(
      bad({ coverage: { from: '2026-01-01', through: 'nope' } }),
    ).toThrowError(/coverage.through/);
    expect(
      bad({ sessions: [{ phase: 'open', start: '9:30', end: '16:00' }] }),
    ).toThrowError(/unparseable time/);
    expect(
      bad({
        sessions: [
          { phase: 'open', start: '09:30', end: '16:00' },
          { phase: 'closing-auction', start: '15:00', end: '16:30' },
        ],
      }),
    ).toThrowError(/sorted and must not overlap/);
    expect(
      bad({
        earlyCloses: [
          {
            date: '2026-02-30',
            sessions: [{ phase: 'open', start: '09:30', end: '13:00' }],
          },
        ],
      }),
    ).toThrowError(/early close date/);
  });
});

describe('the coverage horizon', () => {
  const beyond = '2035-06-13T12:00:00Z'; // a Wednesday, well past the calendar

  it('refuses to answer past the horizon by default', () => {
    const lse = api.defineMarket(XLON);
    try {
      lse.isOpen(beyond);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(api.isMarketHoursError(error)).toBe(true);
      if (api.isMarketHoursError(error)) {
        expect(error.code).toBe('CALENDAR_HORIZON');
        expect(error.details['through']).toBe(XLON.coverage.through);
        expect(error.details['date']).toBe('2035-06-13');
        // The message has to say what to do about it.
        expect(error.message).toMatch(/Upgrade|strict: false|defineMarket/);
      }
    }
  });

  it('answers inside the horizon without complaint', () => {
    const lse = api.defineMarket(XLON);
    expect(lse.isOpen('2026-01-15T12:00:00Z')).toBe(true);
  });

  it('projects instead of throwing when strict is off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lse = api.defineMarket(XLON, { strict: false });

    // Weekends and session times still hold; only the holidays are unknown.
    expect(lse.isOpen(beyond)).toBe(true);
    expect(lse.getStatus(beyond).beyondCoverage).toBe(true);
    expect(lse.isOpen('2035-06-16T12:00:00Z')).toBe(false); // Saturday
    expect(warn).toHaveBeenCalled();
  });

  it('warns once per venue rather than once per call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lse = api.defineMarket(XLON, { strict: false });
    for (let i = 0; i < 50; i += 1) lse.isOpen(beyond);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reports whether a date is covered without throwing', () => {
    const lse = api.defineMarket(XLON);
    expect(lse.covers('2026-01-15')).toBe(true);
    expect(lse.covers(XLON.coverage.through)).toBe(true);
    expect(lse.covers('2035-06-13')).toBe(false);
    expect(lse.covers('2018-06-13')).toBe(false);
    expect(lse.covers(new Date('2026-01-15T12:00:00Z'))).toBe(true);
  });

  it('lets a caller supply their own calendar to extend coverage', () => {
    // The documented escape hatch when the shipped calendar has aged out and
    // upgrading is not an option.
    const extended = api.defineMarket({
      ...XLON,
      coverage: { from: XLON.coverage.from, through: '2035-12-31' },
      holidays: [
        ...XLON.holidays,
        { date: '2035-12-25', name: 'Christmas Day' },
      ],
    });

    expect(extended.isOpen(beyond)).toBe(true);
    expect(extended.isOpen('2035-12-25T12:00:00Z')).toBe(false);
    expect(extended.getStatus(beyond).beyondCoverage).toBe(false);
  });
});

describe('the day schedule', () => {
  const lse = api.defineMarket(XLON);

  it('reports when the venue opens and closes, without digging into sessions', () => {
    const day = lse.getSchedule('2026-01-15');
    expect(day.open?.toISOString()).toBe('2026-01-15T07:50:00.000Z');
    expect(day.close?.toISOString()).toBe('2026-01-15T16:35:00.000Z');
  });

  it('shortens both on a half day', () => {
    const day = lse.getSchedule('2026-12-24');
    expect(day.close?.toISOString()).toBe('2026-12-24T12:35:00.000Z');
  });

  it('reports null on a non-trading day', () => {
    const day = lse.getSchedule('2026-12-25');
    expect(day.open).toBeNull();
    expect(day.close).toBeNull();
    expect(day.holiday).toBe('Christmas Day');
  });
});

describe('the time-zone primitives', () => {
  it('gives a correct wall clock, so nobody needs the broken idiom', () => {
    expect(
      api.toZonedParts('2026-07-15T10:30:00Z', 'Europe/London'),
    ).toMatchObject({ year: 2026, month: 7, day: 15, hour: 11, minute: 30 });
  });

  it('converts a wall clock back to an instant', () => {
    expect(
      api
        .fromZonedParts(
          { year: 2026, month: 7, day: 15, hour: 11, minute: 30 },
          'Europe/London',
        )
        .toISOString(),
    ).toBe('2026-07-15T10:30:00.000Z');
  });

  it('reports the offset', () => {
    expect(
      api.getTimeZoneOffsetMs('Europe/London', '2026-07-15T10:30:00Z'),
    ).toBe(3_600_000);
  });

  it('reports runtime capability', () => {
    expect(api.getTimeZoneSupport('Europe/London').supported).toBe(true);
  });

  it('normalises instants', () => {
    expect(api.toEpochMs('2026-07-15T10:30:00Z')).toBe(
      Date.parse('2026-07-15T10:30:00Z'),
    );
  });
});
