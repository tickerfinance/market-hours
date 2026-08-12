import { afterEach, describe, expect, it, vi } from 'vitest';

import { isMarketHoursError } from './errors.js';
import { toEpochMs } from './instant.js';

const at = (value: string): string => new Date(toEpochMs(value)).toISOString();

function expectRejected(value: unknown): void {
  try {
    toEpochMs(value as never);
    expect.unreachable(`should have rejected ${String(value)}`);
  } catch (error) {
    expect(isMarketHoursError(error)).toBe(true);
    if (isMarketHoursError(error)) expect(error.code).toBe('INVALID_INSTANT');
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('accepted inputs', () => {
  it('defaults to now when omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T10:00:00Z'));
    expect(toEpochMs()).toBe(Date.parse('2026-08-12T10:00:00Z'));
  });

  it('accepts a Date', () => {
    const date = new Date('2026-12-24T09:00:00Z');
    expect(toEpochMs(date)).toBe(date.getTime());
  });

  it('accepts epoch milliseconds and truncates fractions', () => {
    expect(toEpochMs(0)).toBe(0);
    expect(toEpochMs(-1)).toBe(-1);
    expect(toEpochMs(1_700_000_000_123.9)).toBe(1_700_000_000_123);
  });

  it('accepts ISO strings with an explicit offset', () => {
    expect(at('2026-12-24T09:00:00Z')).toBe('2026-12-24T09:00:00.000Z');
    expect(at('2026-12-24t09:00:00z')).toBe('2026-12-24T09:00:00.000Z');
    expect(at('2026-12-24T09:00:00+01:00')).toBe('2026-12-24T08:00:00.000Z');
    expect(at('2026-12-24T09:00:00-05:30')).toBe('2026-12-24T14:30:00.000Z');
    expect(at('2026-12-24T09:00:00+0100')).toBe('2026-12-24T08:00:00.000Z');
  });

  it('accepts fractional seconds of any precision', () => {
    expect(at('2026-12-24T09:00:00.5Z')).toBe('2026-12-24T09:00:00.500Z');
    expect(at('2026-12-24T09:00:00.25Z')).toBe('2026-12-24T09:00:00.250Z');
    expect(at('2026-12-24T09:00:00.125Z')).toBe('2026-12-24T09:00:00.125Z');
    expect(at('2026-12-24T09:00:00.123456789Z')).toBe(
      '2026-12-24T09:00:00.123Z',
    );
    expect(at('2026-12-24T09:00:00,125Z')).toBe('2026-12-24T09:00:00.125Z');
  });

  it('reads an offset-less string as UTC, and says so loudly in the docs', () => {
    expect(at('2026-12-24T09:00:00')).toBe('2026-12-24T09:00:00.000Z');
    expect(at('2026-12-24T09:00')).toBe('2026-12-24T09:00:00.000Z');
    expect(at('2026-12-24')).toBe('2026-12-24T00:00:00.000Z');
  });

  it('accepts a space separator, as emitted by most SQL databases', () => {
    expect(at('2026-12-24 09:00:00Z')).toBe('2026-12-24T09:00:00.000Z');
    expect(at('2026-12-24 09:00:00+00')).toBe('2026-12-24T09:00:00.000Z');
  });

  it('trims surrounding whitespace', () => {
    expect(at('  2026-12-24T09:00:00Z  ')).toBe('2026-12-24T09:00:00.000Z');
  });
});

describe('rejected inputs', () => {
  it('rejects an Invalid Date', () => {
    expectRejected(new Date('nonsense'));
  });

  it('rejects non-finite and out-of-range epoch values', () => {
    expectRejected(Number.NaN);
    expectRejected(Number.POSITIVE_INFINITY);
    expectRejected(8.64e15 + 1);
  });

  it('rejects locale and loose formats that Date would happily guess at', () => {
    expectRejected('Jan 2 2026');
    expectRejected('2026/12/24');
    expectRejected('24-12-2026');
    expectRejected('12/24/2026, 9:00:00 AM');
    expectRejected('');
  });

  it('rejects impossible dates and times', () => {
    expectRejected('2026-02-30T09:00:00Z');
    expectRejected('2026-13-01T09:00:00Z');
    expectRejected('2026-12-24T24:00:00Z');
    expectRejected('2026-12-24T09:60:00Z');
    expectRejected('2026-12-24T09:00:00+24:00');
    expectRejected('2026-12-24T09:00:00+00:60');
  });

  it('rejects a leap second, which no time value can represent', () => {
    expectRejected('2016-12-31T23:59:60Z');
  });

  it('rejects unsupported types', () => {
    expectRejected(null);
    expectRejected(true);
    expectRejected({});
  });
});
