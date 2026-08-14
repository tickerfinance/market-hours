import { afterEach, describe, expect, it, vi } from 'vitest';

import { isMarketHoursError } from '../errors.js';
import {
  assertTimeZoneSupport,
  clearTimeZoneSupportCache,
  getTimeZoneSupport,
} from './capability.js';

afterEach(() => {
  vi.unstubAllGlobals();
  clearTimeZoneSupportCache();
});

const pad = (n: number): string => String(n).padStart(2, '0');

describe('a runtime that works', () => {
  it('reports ok', () => {
    expect(getTimeZoneSupport('Europe/London')).toMatchObject({
      supported: true,
      reason: 'ok',
    });
  });

  it('memoises per zone', () => {
    const first = getTimeZoneSupport('Europe/London');
    expect(getTimeZoneSupport('Europe/London')).toBe(first);
  });

  it('lets assertTimeZoneSupport through', () => {
    expect(() => assertTimeZoneSupport('Europe/London')).not.toThrow();
  });
});

describe('a runtime with no Intl at all', () => {
  it('reports no-intl', () => {
    vi.stubGlobal('Intl', undefined);
    clearTimeZoneSupportCache();
    expect(getTimeZoneSupport('Europe/London')).toMatchObject({
      supported: false,
      reason: 'no-intl',
    });
  });

  it('reports no-intl when DateTimeFormat is missing', () => {
    vi.stubGlobal('Intl', {});
    clearTimeZoneSupportCache();
    expect(getTimeZoneSupport('Europe/London').reason).toBe('no-intl');
  });
});

describe('a runtime built without time-zone data', () => {
  it('reports no-time-zone-support when the constructor rejects the zone', () => {
    vi.stubGlobal('Intl', {
      DateTimeFormat: class {
        constructor() {
          throw new RangeError('Invalid time zone specified');
        }
      },
    });
    clearTimeZoneSupportCache();

    expect(getTimeZoneSupport('Europe/London')).toMatchObject({
      supported: false,
      reason: 'no-time-zone-support',
    });
  });

  it('reports no-time-zone-support when only the probe zones are rejected', () => {
    vi.stubGlobal('Intl', {
      DateTimeFormat: class {
        constructor(_locale: string, options: { timeZone: string }) {
          if (options.timeZone !== 'Europe/London') {
            throw new RangeError('Invalid time zone specified');
          }
        }
      },
    });
    clearTimeZoneSupportCache();

    expect(getTimeZoneSupport('Europe/London').reason).toBe(
      'no-time-zone-support',
    );
  });
});

describe('a runtime that silently ignores the time zone', () => {
  it('is caught by the known-answer probes', () => {
    // This is the dangerous one: nothing throws, every call succeeds, and every
    // answer is silently in UTC. Without a known-answer test it looks healthy.
    vi.stubGlobal('Intl', {
      DateTimeFormat: class {
        formatToParts(date: Date) {
          return [
            { type: 'year', value: String(date.getUTCFullYear()) },
            { type: 'month', value: pad(date.getUTCMonth() + 1) },
            { type: 'day', value: pad(date.getUTCDate()) },
            { type: 'hour', value: pad(date.getUTCHours()) },
            { type: 'minute', value: pad(date.getUTCMinutes()) },
          ];
        }
      },
    });
    clearTimeZoneSupportCache();

    const support = getTimeZoneSupport('Europe/London');
    expect(support).toMatchObject({
      supported: false,
      reason: 'incorrect-offsets',
    });
    expect(support.detail).toContain('Asia/Kolkata');
  });

  it('makes assertTimeZoneSupport throw a typed error', () => {
    vi.stubGlobal('Intl', {
      DateTimeFormat: class {
        formatToParts() {
          return [];
        }
      },
    });
    clearTimeZoneSupportCache();

    try {
      assertTimeZoneSupport('Europe/London');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) {
        expect(error.code).toBe('TIME_ZONE_UNAVAILABLE');
        expect(error.details['reason']).toBe('incorrect-offsets');
      }
    }
  });
});
