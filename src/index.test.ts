import { describe, expect, it } from 'vitest';

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
      'getMarket',
      'getService',
      'getTimeZoneOffsetMs',
      'getTimeZoneSupport',
      'isMarketHoursError',
      'listMarkets',
      'listServices',
      'toEpochMs',
      'toZonedParts',
    ]);
  });
});

describe('the registry', () => {
  it('returns the same instance for repeated lookups', () => {
    expect(api.getMarket('XLON')).toBe(api.getMarket('XLON'));
  });

  it('accepts any casing and surrounding whitespace', () => {
    expect(api.getMarket('xlon').id).toBe('XLON');
    expect(api.getMarket(' XLon ').id).toBe('XLON');
    expect(api.getService('rns').id).toBe('RNS');
  });

  it('describes the venues it ships', () => {
    expect(api.listMarkets()).toEqual([
      {
        id: 'XLON',
        type: 'exchange',
        name: 'London Stock Exchange',
        timeZone: 'Europe/London',
      },
    ]);
    expect(api.listServices()).toEqual([
      {
        id: 'RNS',
        type: 'news-service',
        name: 'Regulatory News Service',
        timeZone: 'Europe/London',
      },
    ]);
  });

  it('rejects an unknown venue with the list of what it has', () => {
    try {
      api.getMarket('XPAR');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(api.isMarketHoursError(error)).toBe(true);
      if (api.isMarketHoursError(error)) {
        expect(error.code).toBe('UNKNOWN_VENUE');
        expect(error.details['available']).toEqual(['XLON']);
        expect(error.message).toContain('defineMarket');
      }
    }
  });

  it('points you at the other lookup when you use the wrong one', () => {
    expect(() => api.getService('XLON')).toThrowError(/getMarket/);
    expect(() => api.getMarket('RNS')).toThrowError(/getService/);
  });

  it('rejects an empty id', () => {
    expect(() => api.getMarket('')).toThrowError(/venue id is required/);
    expect(() => api.getMarket('   ')).toThrowError(/venue id is required/);
  });
});

const CUSTOM: VenueData = {
  id: 'TEST',
  type: 'exchange',
  name: 'Test Exchange',
  timeZone: 'America/New_York',
  weekend: [0, 6],
  sessions: [{ phase: 'open', start: '09:30', end: '16:00' }],
  coverage: { from: '2026-01-01', through: '2026-12-31' },
  sources: [],
  holidays: [{ date: '2026-07-03', name: 'Independence Day (observed)' }],
  earlyCloses: [
    {
      date: '2026-11-27',
      sessions: [{ phase: 'open', start: '09:30', end: '13:00' }],
    },
  ],
};

describe('defining your own venue', () => {
  it('works without touching the global registry', () => {
    const custom = api.defineMarket(CUSTOM);
    expect(custom.id).toBe('TEST');
    expect(custom.timeZone).toBe('America/New_York');
    // 14:00Z is 09:00 in New York in November — before the open.
    expect(custom.isOpen('2026-11-20T14:00:00Z')).toBe(false);
    expect(custom.isOpen('2026-11-20T15:00:00Z')).toBe(true);
    expect(custom.isOpen('2026-07-03T15:00:00Z')).toBe(false);
    expect(custom.isOpen('2026-11-27T18:30:00Z')).toBe(false); // early close

    expect(api.listMarkets().map((venue) => venue.id)).toEqual(['XLON']);
    expect(() => api.getMarket('TEST')).toThrowError(/No built-in calendar/);
  });

  it('rejects a definition whose type does not match', () => {
    expect(() => api.defineService(CUSTOM)).toThrowError(
      /type must be 'news-service'/,
    );
  });

  it('rejects a malformed definition', () => {
    const bad =
      (patch: Partial<VenueData>): (() => unknown) =>
      () =>
        api.defineMarket({ ...CUSTOM, ...patch });

    expect(bad({ id: 'lowercase' })).toThrowError(/uppercase/);
    expect(bad({ sessions: [] })).toThrowError(/at least one session/);
    expect(
      bad({ coverage: { from: 'nope', through: '2026-12-31' } }),
    ).toThrowError(/coverage.from/);
    expect(
      bad({ sessions: [{ phase: 'open', start: '16:00', end: '09:30' }] }),
    ).toThrowError(/ending at or before it starts/);
    expect(
      bad({
        sessions: [
          { phase: 'open', start: '09:30', end: '16:00' },
          { phase: 'closing-auction', start: '15:00', end: '16:30' },
        ],
      }),
    ).toThrowError(/sorted and must not overlap/);
    expect(
      bad({ holidays: [{ date: '2026-13-01', name: 'Nope' }] }),
    ).toThrowError(/holiday date/);
    expect(
      bad({ sessions: [{ phase: 'open', start: '9:30', end: '16:00' }] }),
    ).toThrowError(/unparseable time/);
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
    expect(
      api.getTimeZoneOffsetMs('Europe/London', '2026-01-15T10:30:00Z'),
    ).toBe(0);
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
