import { describe, expect, it } from 'vitest';

import { getMarket, getService, toZonedParts } from '../src/index.js';

/**
 * Answers that must be identical no matter what time zone the machine running
 * the tests is set to.
 *
 * `scripts/run-tz-matrix.mjs` runs the whole suite once per zone, including a
 * half-hour offset, a 45-minute offset, a zone whose DST step is 30 minutes,
 * and one on the far side of the date line. A machine 14 hours ahead of UTC is
 * what catches "the civil date is a day out"; the 45-minute zone catches offset
 * arithmetic that assumes whole hours.
 *
 * The implementation this package replaces passed on a UTC server in winter and
 * failed everywhere else. These assertions are the reason that cannot recur.
 */
// `process` does not exist in a browser or on a bare Worker, and this spec is
// worth running there too: in a browser the host zone is the reader's own
// machine, which is the most realistic version of this test there is.
const HOST_ZONE =
  (typeof process === 'undefined' ? undefined : process.env['TZ']) ??
  Intl.DateTimeFormat().resolvedOptions().timeZone;

describe(`host time zone: ${HOST_ZONE}`, () => {
  const lse = getMarket('XLON');
  const rns = getService('RNS');

  it('reports London wall-clock time, not the host clock', () => {
    expect(lse.getStatus('2026-01-15T12:00:00Z').localTime).toBe(
      '12:00:00.000',
    );
    expect(lse.getStatus('2026-07-15T12:00:00Z').localTime).toBe(
      '13:00:00.000',
    );
    expect(lse.getStatus('2026-01-15T12:00:00Z').localDate).toBe('2026-01-15');
  });

  it('puts an instant on the right London civil date near midnight', () => {
    // 23:30Z on the 15th is still the 15th in London; 00:30Z is the 16th. A
    // host far east or west of UTC gets this wrong if it uses its own calendar.
    expect(lse.getStatus('2026-01-15T23:30:00Z').localDate).toBe('2026-01-15');
    expect(lse.getStatus('2026-01-16T00:30:00Z').localDate).toBe('2026-01-16');
    expect(lse.getStatus('2026-07-15T23:30:00Z').localDate).toBe('2026-07-16');
  });

  it('opens and closes at the same UTC instants regardless of host', () => {
    expect(lse.isOpen('2026-01-15T07:59:59.999Z')).toBe(false);
    expect(lse.isOpen('2026-01-15T08:00:00.000Z')).toBe(true);
    expect(lse.isOpen('2026-01-15T16:29:59.999Z')).toBe(true);
    expect(lse.isOpen('2026-01-15T16:30:00.000Z')).toBe(false);

    // The same session an hour earlier in UTC during British Summer Time.
    expect(lse.isOpen('2026-07-15T06:59:59.999Z')).toBe(false);
    expect(lse.isOpen('2026-07-15T07:00:00.000Z')).toBe(true);
    expect(lse.isOpen('2026-07-15T15:29:59.999Z')).toBe(true);
    expect(lse.isOpen('2026-07-15T15:30:00.000Z')).toBe(false);
  });

  it('agrees on weekends, holidays and half days', () => {
    expect(lse.isTradingDay('2026-01-17')).toBe(false);
    expect(lse.isOpen('2026-12-25T12:00:00Z')).toBe(false);
    expect(lse.isOpen('2026-12-24T10:00:00Z')).toBe(true);
    expect(lse.isOpen('2026-12-24T14:00:00Z')).toBe(false);
    expect(rns.isOpen('2026-12-24T13:00:00Z')).toBe(true);
    expect(rns.isOpen('2026-12-24T14:00:00Z')).toBe(false);
  });

  it('computes transition instants identically', () => {
    expect(lse.nextOpen('2026-01-16T18:00:00Z').toISOString()).toBe(
      '2026-01-19T08:00:00.000Z',
    );
    expect(lse.nextClose('2026-07-15T09:00:00Z').toISOString()).toBe(
      '2026-07-15T15:30:00.000Z',
    );
  });

  it('converts wall-clock components without consulting the host zone', () => {
    expect(toZonedParts('2026-07-15T10:30:00Z', 'Europe/London')).toMatchObject(
      {
        year: 2026,
        month: 7,
        day: 15,
        hour: 11,
        minute: 30,
        offsetMs: 3_600_000,
      },
    );
    expect(toZonedParts('2026-07-15T10:30:00Z', 'Asia/Kolkata')).toMatchObject({
      hour: 16,
      minute: 0,
    });
    expect(
      toZonedParts('2026-07-15T10:30:00Z', 'Pacific/Chatham'),
    ).toMatchObject({ day: 15, hour: 23, minute: 15 });
  });
});
