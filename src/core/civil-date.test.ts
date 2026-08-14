import { describe, expect, it } from 'vitest';

import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  formatIsoDate,
  formatWallTime,
  isLeapYear,
  isValidCivilDate,
  parseIsoDate,
  parseWallTime,
  weekdayFromCivil,
} from './civil-date.js';

describe('daysFromCivil', () => {
  it('anchors the epoch at zero', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
  });

  it('handles dates before the epoch', () => {
    expect(daysFromCivil(1969, 12, 31)).toBe(-1);
    expect(daysFromCivil(1900, 1, 1)).toBe(-25567);
  });

  it('round-trips with civilFromDays across two centuries', () => {
    for (let days = -36524; days <= 36524; days += 7) {
      const { year, month, day } = civilFromDays(days);
      expect(daysFromCivil(year, month, day)).toBe(days);
    }
  });

  it('agrees with Date.UTC, which is the only place we let Date be an oracle', () => {
    for (const [y, m, d] of [
      [1970, 1, 1],
      [1999, 12, 31],
      [2000, 2, 29],
      [2026, 8, 12],
      [2100, 3, 1],
      [1583, 1, 1],
    ] as const) {
      expect(daysFromCivil(y, m, d) * 86_400_000).toBe(Date.UTC(y, m - 1, d));
    }
  });
});

describe('weekdayFromCivil', () => {
  it('knows the epoch was a Thursday', () => {
    expect(weekdayFromCivil(1970, 1, 1)).toBe(4);
  });

  it('matches known weekdays', () => {
    expect(weekdayFromCivil(2026, 8, 12)).toBe(3); // Wednesday
    expect(weekdayFromCivil(2026, 12, 24)).toBe(4); // Thursday
    expect(weekdayFromCivil(2026, 12, 25)).toBe(5); // Friday
    expect(weekdayFromCivil(2026, 1, 4)).toBe(0); // Sunday
    expect(weekdayFromCivil(2026, 1, 3)).toBe(6); // Saturday
  });

  it('never leaves the 0-6 range, including before the epoch', () => {
    for (let days = -40000; days <= 40000; days += 13) {
      const { year, month, day } = civilFromDays(days);
      const weekday = weekdayFromCivil(year, month, day);
      expect(weekday).toBeGreaterThanOrEqual(0);
      expect(weekday).toBeLessThanOrEqual(6);
    }
  });
});

describe('leap years and month lengths', () => {
  it('applies the full Gregorian rule', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('gives February the right length', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 1)).toBe(31);
    expect(daysInMonth(2025, 4)).toBe(30);
  });
});

describe('isValidCivilDate', () => {
  it('rejects impossible dates', () => {
    expect(isValidCivilDate(2025, 2, 29)).toBe(false);
    expect(isValidCivilDate(2025, 13, 1)).toBe(false);
    expect(isValidCivilDate(2025, 0, 1)).toBe(false);
    expect(isValidCivilDate(2025, 4, 31)).toBe(false);
    expect(isValidCivilDate(2025, 1, 0)).toBe(false);
    expect(isValidCivilDate(2025.5, 1, 1)).toBe(false);
    expect(isValidCivilDate(2025, 1.5, 1)).toBe(false);
    expect(isValidCivilDate(2025, 1, 1.5)).toBe(false);
  });

  it('accepts real ones', () => {
    expect(isValidCivilDate(2024, 2, 29)).toBe(true);
    expect(isValidCivilDate(2026, 12, 31)).toBe(true);
  });
});

describe('formatting', () => {
  it('zero-pads ISO dates', () => {
    expect(formatIsoDate(2026, 1, 2)).toBe('2026-01-02');
    expect(formatIsoDate(999, 12, 31)).toBe('0999-12-31');
  });

  it('zero-pads wall times to milliseconds', () => {
    expect(formatWallTime(8, 0, 0, 0)).toBe('08:00:00.000');
    expect(formatWallTime(16, 29, 59, 999)).toBe('16:29:59.999');
  });
});

describe('parseIsoDate', () => {
  it('accepts a real date', () => {
    expect(parseIsoDate('2026-12-24')).toEqual({
      year: 2026,
      month: 12,
      day: 24,
    });
  });

  it('rejects anything else', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('26-12-24')).toBeNull();
    expect(parseIsoDate('2026/12/24')).toBeNull();
    expect(parseIsoDate('2026-12-24T00:00:00Z')).toBeNull();
  });
});

describe('parseWallTime', () => {
  it('returns minutes since local midnight', () => {
    expect(parseWallTime('00:00')).toBe(0);
    expect(parseWallTime('08:00')).toBe(480);
    expect(parseWallTime('16:30')).toBe(990);
    expect(parseWallTime('23:59')).toBe(1439);
  });

  it('allows 24:00 so a session can end at midnight', () => {
    expect(parseWallTime('24:00')).toBe(1440);
  });

  it('rejects malformed or out-of-range times', () => {
    expect(parseWallTime('24:01')).toBeNull();
    expect(parseWallTime('25:00')).toBeNull();
    expect(parseWallTime('08:60')).toBeNull();
    expect(parseWallTime('8:00')).toBeNull();
    expect(parseWallTime('08:00:00')).toBeNull();
  });
});
