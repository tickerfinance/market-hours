/**
 * Civil (proleptic Gregorian) date arithmetic that never touches a `Date`.
 *
 * `Date.prototype.getDay()` and friends answer in the *host's* time zone, which
 * is exactly the bug this package exists to eliminate. Everything here is pure
 * integer arithmetic on a year/month/day triple, so the host's clock and locale
 * are irrelevant.
 *
 * The day-number algorithms are Howard Hinnant's `days_from_civil` /
 * `civil_from_days`, which are exact for the full range of `Date`.
 */

export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01, which is day 0. Negative before the epoch. */
export function daysFromCivil(
  year: number,
  month: number,
  day: number,
): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400; // [0, 399]
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear; // [0, 146096]
  return era * 146097 + dayOfEra - 719468;
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097; // [0, 146096]
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  ); // [0, 399]
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100)); // [0, 365]
  const mp = Math.floor((5 * dayOfYear + 2) / 153); // [0, 11]
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

/** 0 = Sunday … 6 = Saturday. Day 0 (1970-01-01) was a Thursday. */
export function weekdayFromCivil(
  year: number,
  month: number,
  day: number,
): number {
  const days = daysFromCivil(year, month, day);
  return (((days + 4) % 7) + 7) % 7;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month - 1] as number;
}

export function isValidCivilDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return false;
  if (!Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

function pad(value: number, width: number): string {
  const s = String(Math.abs(value));
  return (value < 0 ? '-' : '') + s.padStart(width, '0');
}

/** `YYYY-MM-DD`. */
export function formatIsoDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `HH:mm:ss.SSS`. */
export function formatWallTime(
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): string {
  return `${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}.${pad(
    millisecond,
    3,
  )}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD`, returning null if it is not a real calendar date. */
export function parseIsoDate(value: string): CivilDate | null {
  const match = ISO_DATE.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCivilDate(year, month, day)) return null;
  return { year, month, day };
}

const WALL_TIME = /^(\d{2}):(\d{2})$/;

/** Parses `HH:mm` into minutes since local midnight, or null. */
export function parseWallTime(value: string): number | null {
  const match = WALL_TIME.exec(value);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  // 24:00 is permitted so a session can end at midnight.
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
