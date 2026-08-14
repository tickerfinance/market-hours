import { afterEach, describe, expect, it, vi } from 'vitest';

import { isMarketHoursError } from '../errors.js';
import { clearFormatterCache, getFormatter } from './formatter-cache.js';
import { offsetMsAt, zonedPartsFromEpochMs } from './to-zoned.js';

const HOUR = 3_600_000;
const LONDON = 'Europe/London';

afterEach(() => {
  vi.unstubAllGlobals();
  clearFormatterCache();
});

describe('zonedPartsFromEpochMs', () => {
  it('reads GMT correctly', () => {
    const parts = zonedPartsFromEpochMs(
      Date.UTC(2026, 0, 15, 10, 30, 0),
      LONDON,
    );
    expect(parts).toMatchObject({
      year: 2026,
      month: 1,
      day: 15,
      hour: 10,
      minute: 30,
      second: 0,
      millisecond: 0,
      weekday: 4,
      offsetMs: 0,
    });
  });

  it('reads BST correctly', () => {
    const parts = zonedPartsFromEpochMs(
      Date.UTC(2026, 6, 15, 10, 30, 0),
      LONDON,
    );
    expect(parts).toMatchObject({
      year: 2026,
      month: 7,
      day: 15,
      hour: 11,
      minute: 30,
      offsetMs: HOUR,
    });
  });

  it('lands exactly on both 2026 transition instants', () => {
    expect(offsetMsAt(LONDON, Date.parse('2026-03-29T00:59:59.999Z'))).toBe(0);
    expect(offsetMsAt(LONDON, Date.parse('2026-03-29T01:00:00.000Z'))).toBe(
      HOUR,
    );
    expect(offsetMsAt(LONDON, Date.parse('2026-10-25T00:59:59.999Z'))).toBe(
      HOUR,
    );
    expect(offsetMsAt(LONDON, Date.parse('2026-10-25T01:00:00.000Z'))).toBe(0);
  });

  it('rolls the civil date over when the zone is ahead of UTC', () => {
    const parts = zonedPartsFromEpochMs(
      Date.UTC(2026, 0, 15, 23, 30, 0),
      'Pacific/Kiritimati',
    );
    expect(parts).toMatchObject({ year: 2026, month: 1, day: 16, hour: 13 });
    expect(parts.offsetMs).toBe(14 * HOUR);
  });

  it('handles a 45-minute offset', () => {
    const parts = zonedPartsFromEpochMs(
      Date.UTC(2026, 0, 15, 0, 0, 0),
      'Pacific/Chatham',
    );
    expect(parts.offsetMs).toBe(13 * HOUR + 45 * 60_000);
  });

  it('preserves milliseconds, including before 1970', () => {
    expect(zonedPartsFromEpochMs(1, LONDON).millisecond).toBe(1);
    expect(zonedPartsFromEpochMs(-1, 'UTC')).toMatchObject({
      year: 1969,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
  });

  it('honours British Standard Time, when the UK stayed on UTC+1 all year', () => {
    // Between 1968-10-27 and 1971-10-31 the UK did not put its clocks back, so
    // the instant before the epoch was already 1970 in London. Delegating to
    // the IANA database gets this right; any hand-rolled GMT/BST rule does not.
    expect(zonedPartsFromEpochMs(-1, LONDON)).toMatchObject({
      year: 1970,
      month: 1,
      day: 1,
      hour: 0,
      minute: 59,
      second: 59,
      millisecond: 999,
      offsetMs: HOUR,
    });
  });

  it('keeps sub-minute historical offsets intact', () => {
    // London ran on Local Mean Time (-00:01:15) until 1847.
    const parts = zonedPartsFromEpochMs(Date.UTC(1840, 0, 1, 12, 0, 0), LONDON);
    expect(parts.offsetMs % 60_000).not.toBe(0);
  });
});

describe('resilience to the runtime', () => {
  function stubParts(parts: ReadonlyArray<{ type: string; value: string }>) {
    class FakeDateTimeFormat {
      formatToParts() {
        return parts;
      }
    }
    vi.stubGlobal('Intl', { DateTimeFormat: FakeDateTimeFormat });
    clearFormatterCache();
  }

  it('reads parts by type, not by position', () => {
    // Deliberately reversed, with literals interleaved, because part order is
    // locale- and ICU-version-dependent.
    stubParts([
      { type: 'second', value: '09' },
      { type: 'literal', value: ':' },
      { type: 'minute', value: '30' },
      { type: 'literal', value: ' ' },
      { type: 'hour', value: '10' },
      { type: 'era', value: 'AD' },
      { type: 'day', value: '15' },
      { type: 'month', value: '01' },
      { type: 'year', value: '2026' },
    ]);

    expect(zonedPartsFromEpochMs(0, 'Fake/Zone')).toMatchObject({
      year: 2026,
      month: 1,
      day: 15,
      hour: 10,
      minute: 30,
      second: 9,
    });
  });

  it('normalises hour 24 to hour 0 of the same day', () => {
    stubParts([
      { type: 'year', value: '2026' },
      { type: 'month', value: '01' },
      { type: 'day', value: '15' },
      { type: 'hour', value: '24' },
      { type: 'minute', value: '00' },
      { type: 'second', value: '00' },
    ]);

    expect(zonedPartsFromEpochMs(0, 'Fake/Zone')).toMatchObject({
      day: 15,
      hour: 0,
    });
  });

  it('rejects BC years rather than silently wrapping them', () => {
    stubParts([
      { type: 'year', value: '44' },
      { type: 'month', value: '03' },
      { type: 'day', value: '15' },
      { type: 'hour', value: '12' },
      { type: 'minute', value: '00' },
      { type: 'second', value: '00' },
      { type: 'era', value: 'BC' },
    ]);

    expect(() => zonedPartsFromEpochMs(0, 'Fake/Zone')).toThrowError(
      /before 1 AD/,
    );
  });

  it('throws when the runtime omits parts entirely', () => {
    stubParts([{ type: 'literal', value: 'nope' }]);

    try {
      zonedPartsFromEpochMs(0, 'Fake/Zone');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) {
        expect(error.code).toBe('TIME_ZONE_UNAVAILABLE');
      }
    }
  });
});

describe('formatter cache', () => {
  it('returns the same instance per zone and distinct ones across zones', () => {
    const a = getFormatter(LONDON);
    const b = getFormatter(LONDON);
    const c = getFormatter('America/New_York');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('reports an unknown zone with a typed error', () => {
    try {
      getFormatter('Not/AZone');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) {
        expect(error.code).toBe('INVALID_TIME_ZONE');
        expect(error.details['timeZone']).toBe('Not/AZone');
      }
    }
  });
});
