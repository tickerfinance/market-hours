import { describe, expect, it } from 'vitest';

import { XLON, XLON_CALENDAR } from './calendars/exchanges/XLON.generated.js';
import { RNS, RNS_CALENDAR } from './calendars/news-services/RNS.generated.js';
import * as api from './index.js';
import type { VenueData } from './index.js';

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

describe('a shipped venue', () => {
  it('is ready to query on import, with no setup', () => {
    // The whole point of the two exports. `defineMarket` is for changing a
    // venue or adding one, not for using the ones we ship.
    expect(XLON.id).toBe('XLON');
    expect(XLON.type).toBe('exchange');
    expect(XLON.isOpen('2026-01-15T12:00:00Z')).toBe(true);
    expect(XLON.isOpen('2026-12-24T14:00:00Z')).toBe(false); // half day

    expect(RNS.id).toBe('RNS');
    expect(RNS.isOpen('2026-01-15T18:00:00Z')).toBe(true);
  });

  it('is one instance, so callers share its day-schedule cache', () => {
    // A registry used to make this free; importing the built venue restores it.
    // Two `defineMarket` calls still make two venues, which is why the shipped
    // path should not be a `defineMarket` call.
    expect(XLON).toBe(XLON);
    expect(api.defineMarket(XLON_CALENDAR)).not.toBe(XLON);
  });

  it('refuses a date its calendar does not cover', () => {
    expect(() => XLON.isOpen('2035-06-13T12:00:00Z')).toThrowError(
      /verified holidays/,
    );
  });

  it('ships the calendar behind it, so it can be overridden', () => {
    expect(XLON_CALENDAR.id).toBe('XLON');
    expect(XLON_CALENDAR.type).toBe('exchange');
    // Not the venue: this one has no methods.
    expect('isOpen' in XLON_CALENDAR).toBe(false);
  });
});

describe('defining a venue', () => {
  it('builds an exchange from shipped data', () => {
    const lse = api.defineMarket(XLON_CALENDAR);
    expect(lse.id).toBe('XLON');
    expect(lse.type).toBe('exchange');
    expect(lse.isOpen('2026-01-15T12:00:00Z')).toBe(true);
  });

  it('builds a news service from shipped data', () => {
    const rns = api.defineService(RNS_CALENDAR);
    expect(rns.id).toBe('RNS');
    expect(rns.isOpen('2026-01-15T18:00:00Z')).toBe(true);
  });

  it('rejects a definition whose type does not match', () => {
    // @ts-expect-error an exchange is not a news service
    expect(() => api.defineService(XLON_CALENDAR)).toThrowError(
      /type must be 'news-service'/,
    );
    // @ts-expect-error a news service is not an exchange
    expect(() => api.defineMarket(RNS_CALENDAR)).toThrowError(
      /type must be 'exchange'/,
    );
  });

  it('rejects something that is not a definition at all', () => {
    for (const value of [null, undefined, 'XLON', 42]) {
      expect(() =>
        api.defineMarket(value as unknown as VenueData<'exchange'>),
      ).toThrowError(/definition object is required|type must be/);
    }
  });

  it('rejects a malformed definition', () => {
    const bad =
      (patch: Partial<VenueData<'exchange'>>): (() => unknown) =>
      () =>
        api.defineMarket({ ...XLON_CALENDAR, ...patch });

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
    const lse = api.defineMarket(XLON_CALENDAR);
    try {
      lse.isOpen(beyond);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(api.isMarketHoursError(error)).toBe(true);
      if (api.isMarketHoursError(error)) {
        expect(error.code).toBe('CALENDAR_HORIZON');
        expect(error.details['through']).toBe(XLON_CALENDAR.coverage.through);
        expect(error.details['date']).toBe('2035-06-13');
        expect(error.details['side']).toBe('after');
        // The message has to say what to do about it.
        expect(error.message).toMatch(/Upgrade|defineMarket/);
      }
    }
  });

  it('does not tell you to upgrade for a date before the calendar starts', () => {
    // Upgrading extends `through`; it will never add years before `from`. A
    // backfill or a historical replay hits this end, and "upgrade the package"
    // sends it after a fix that does not exist.
    const lse = api.defineMarket(XLON_CALENDAR);
    try {
      lse.isOpen('2018-06-01T12:00:00Z');
      expect.unreachable('should have thrown');
    } catch (error) {
      if (!api.isMarketHoursError(error)) throw error;
      expect(error.code).toBe('CALENDAR_HORIZON');
      expect(error.details['side']).toBe('before');
      expect(error.message).toContain('will not add dates before');
      expect(error.message).not.toMatch(/Upgrade market-hours/);
      // The escape hatches that do work are still offered.
      expect(error.message).toContain('defineMarket');
    }
  });

  it('answers for every covered date at the start of the range too', () => {
    // The upper bound got swept; nobody had swept the lower one.
    const lse = api.defineMarket(XLON_CALENDAR);
    const first = XLON_CALENDAR.coverage.from;

    expect(lse.covers(first)).toBe(true);
    expect(() => lse.getStatus(`${first}T12:00:00Z`)).not.toThrow();
    expect(lse.isTradingDay(first)).toBe(false); // 2019-01-01, New Year's Day
    expect(lse.nextOpen(`${first}T12:00:00Z`).toISOString()).toBe(
      '2019-01-02T08:00:00.000Z',
    );
  });

  it('answers inside the horizon without complaint', () => {
    const lse = api.defineMarket(XLON_CALENDAR);
    expect(lse.isOpen('2026-01-15T12:00:00Z')).toBe(true);
  });

  it('answers for every covered date, right up to the last one', () => {
    // The bug this replaced: `getStatus` used to resolve the next transition
    // eagerly, so once the final covered session closed, every call threw for
    // dates that `covers()` said were fine — 3,325 minutes of them.
    const lse = api.defineMarket(XLON_CALENDAR);
    const last = XLON_CALENDAR.coverage.through;

    expect(lse.covers(last)).toBe(true);
    expect(() => lse.isOpen(`${last}T12:00:00Z`)).not.toThrow();
    expect(() => lse.getStatus(`${last}T23:59:00Z`)).not.toThrow();
    expect(() => lse.getSchedule(last)).not.toThrow();
    expect(() => lse.isTradingDay(last)).not.toThrow();
  });

  it('still refuses a forward-looking question that lands past the horizon', () => {
    // Unlike the above, this one genuinely asks about an uncovered date.
    const lse = api.defineMarket(XLON_CALENDAR);
    expect(() =>
      lse.nextOpen(`${XLON_CALENDAR.coverage.through}T23:59:00Z`),
    ).toThrow();
  });

  it('reports whether a date is covered without throwing', () => {
    const lse = api.defineMarket(XLON_CALENDAR);
    expect(lse.covers('2026-01-15')).toBe(true);
    expect(lse.covers(XLON_CALENDAR.coverage.through)).toBe(true);
    expect(lse.covers('2035-06-13')).toBe(false);
    expect(lse.covers('2018-06-13')).toBe(false);
    expect(lse.covers(new Date('2026-01-15T12:00:00Z'))).toBe(true);
  });

  it('lets a caller supply their own calendar to extend coverage', () => {
    // The documented escape hatch when the shipped calendar has aged out and
    // upgrading is not an option.
    const extended = api.defineMarket({
      ...XLON_CALENDAR,
      coverage: { from: XLON_CALENDAR.coverage.from, through: '2035-12-31' },
      holidays: [
        ...XLON_CALENDAR.holidays,
        { date: '2035-12-25', name: 'Christmas Day' },
      ],
    });

    expect(extended.isOpen(beyond)).toBe(true);
    expect(extended.isOpen('2035-12-25T12:00:00Z')).toBe(false);
    expect(extended.covers(beyond)).toBe(true);
  });
});

describe('the day schedule', () => {
  const lse = api.defineMarket(XLON_CALENDAR);

  it('reports when the day starts and ends, without digging into sessions', () => {
    const day = lse.getSchedule('2026-01-15');
    expect(day.dayStart?.toISOString()).toBe('2026-01-15T07:50:00.000Z');
    expect(day.dayEnd?.toISOString()).toBe('2026-01-15T16:35:00.000Z');
  });

  it('starts the day with the auction, not with continuous trading', () => {
    // Why the field is not called `open`: an exchange opens in stages, and the
    // first session is the opening auction. Anything treating dayStart as the
    // start of trading would act ten minutes early and look right.
    const day = lse.getSchedule('2026-01-15');
    expect(day.sessions[0]?.phase).toBe('pre-open-auction');
    const trading = day.sessions.find((session) => session.phase === 'open');
    expect(trading?.start.toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(day.dayStart?.toISOString()).not.toBe(trading?.start.toISOString());
  });

  it('shortens both on a half day', () => {
    const day = lse.getSchedule('2026-12-24');
    expect(day.dayEnd?.toISOString()).toBe('2026-12-24T12:35:00.000Z');
  });

  it('reports null on a non-trading day', () => {
    const day = lse.getSchedule('2026-12-25');
    expect(day.dayStart).toBeNull();
    expect(day.dayEnd).toBeNull();
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
