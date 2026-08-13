import { describe, expect, it } from 'vitest';

import {
  defineMarket,
  fromZonedParts,
  getMarket,
  getService,
  getTimeZoneOffsetMs,
  toZonedParts,
} from './index.js';

/**
 * Every `Date` method whose answer depends on the machine's own time zone.
 *
 * The bug this package replaces was
 * `new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }))`, which
 * is only correct when the host happens to be running in UTC during GMT. A code
 * review will not reliably catch that idiom coming back. Making the methods
 * throw while the entire public API runs will.
 */
const HOST_LOCAL_METHODS = [
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  'getDay',
  'getDate',
  'getMonth',
  'getFullYear',
  'getYear',
  'getTimezoneOffset',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toDateString',
  'toTimeString',
] as const;

function withHostLocalMethodsTrapped<T>(run: () => T): T {
  const prototype = Date.prototype as unknown as Record<string, unknown>;
  const originals = new Map<string, unknown>();

  for (const method of HOST_LOCAL_METHODS) {
    originals.set(method, prototype[method]);
    prototype[method] = function trapped(): never {
      throw new Error(
        `Date.prototype.${method}() answers in the host time zone and must never be used`,
      );
    };
  }

  try {
    return run();
  } finally {
    for (const [method, original] of originals) {
      prototype[method] = original;
    }
  }
}

describe('the package never asks the host what time it is locally', () => {
  it('answers every public call with the host-local Date methods trapped', () => {
    const results = withHostLocalMethodsTrapped(() => {
      const lse = getMarket('XLON');
      const rns = getService('RNS');

      const custom = defineMarket({
        id: 'TEST',
        type: 'exchange',
        name: 'Test',
        timeZone: 'Asia/Kolkata',
        weekend: [0, 6],
        sessions: [{ phase: 'open', start: '09:15', end: '15:30' }],
        coverage: { from: '2026-01-01', through: '2026-12-31' },
        sources: [],
        holidays: [{ date: '2026-01-26', name: 'Republic Day' }],
        earlyCloses: [],
      });

      return {
        isOpen: lse.isOpen('2026-01-15T12:00:00Z'),
        halfDay: lse.isOpen('2026-12-24T14:00:00Z'),
        inSession: lse.inSession('2026-01-15T16:32:00Z'),
        tradingDay: lse.isTradingDay('2026-01-15'),
        status: lse.getStatus('2026-01-15T12:00:00Z'),
        schedule: lse.getSchedule('2026-12-24'),
        transition: lse.nextTransition('2026-01-15T12:00:00Z'),
        nextOpen: lse.nextOpen('2026-01-15T18:00:00Z'),
        nextClose: lse.nextClose('2026-01-15T12:00:00Z'),
        coverage: lse.getCoverage(),
        rnsOpen: rns.isOpen('2026-01-15T18:00:00Z'),
        customOpen: custom.isOpen('2026-06-15T05:00:00Z'),
        parts: toZonedParts('2026-07-15T10:30:00Z', 'Europe/London'),
        instant: fromZonedParts(
          { year: 2026, month: 7, day: 15, hour: 11, minute: 30 },
          'Europe/London',
        ),
        offset: getTimeZoneOffsetMs('Europe/London', '2026-07-15T10:30:00Z'),
        now: lse.isOpen(),
      };
    });

    // Sanity-check a few of the answers, so a silently no-op run cannot pass.
    expect(results.isOpen).toBe(true);
    expect(results.halfDay).toBe(false);
    expect(results.inSession).toBe(true);
    expect(results.status.phase).toBe('open');
    expect(results.status.localTime).toBe('12:00:00.000');
    expect(results.schedule.sessions).toHaveLength(3);
    expect(results.transition.to).toBe('closing-auction');
    expect(results.nextOpen.toISOString()).toBe('2026-01-16T08:00:00.000Z');
    expect(results.nextClose.toISOString()).toBe('2026-01-15T16:30:00.000Z');
    expect(results.rnsOpen).toBe(true);
    expect(results.customOpen).toBe(true);
    expect(results.parts.hour).toBe(11);
    expect(results.instant.toISOString()).toBe('2026-07-15T10:30:00.000Z');
    expect(results.offset).toBe(3_600_000);
    expect(typeof results.now).toBe('boolean');
  });

  it('really does trap, so the test above cannot pass vacuously', () => {
    expect(() =>
      withHostLocalMethodsTrapped(() => new Date().getHours()),
    ).toThrowError(/host time zone/);
  });

  it('restores the prototype afterwards', () => {
    withHostLocalMethodsTrapped(() => undefined);
    expect(() => new Date().getHours()).not.toThrow();
  });
});
