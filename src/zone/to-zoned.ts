import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  daysFromCivil,
  weekdayFromCivil,
} from '../core/civil-date.js';
import { MarketHoursError } from '../errors.js';
import { getFormatter } from './formatter-cache.js';

export interface ZonedParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
  readonly second: number; // 0-59
  readonly millisecond: number; // 0-999
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  /** Zone offset from UTC at this instant, in milliseconds. */
  readonly offsetMs: number;
}

/**
 * Converts an instant to wall-clock components in `timeZone`.
 *
 * Parts are read by `type` and never by index: the order of the array returned
 * by `formatToParts` is locale- and ICU-version-dependent, and indexing into it
 * is a bug that only shows up on someone else's runtime.
 */
export function zonedPartsFromEpochMs(
  epochMs: number,
  timeZone: string,
): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(epochMs));

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  let hour: number | undefined;
  let minute: number | undefined;
  let second: number | undefined;
  let era: string | undefined;

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
      case 'era':
        era = part.value;
        break;
      default:
        break;
    }
  }

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second)
  ) {
    throw new MarketHoursError(
      'TIME_ZONE_UNAVAILABLE',
      `Runtime did not return usable date parts for time zone ${timeZone}`,
      { timeZone, epochMs },
    );
  }

  if (era !== undefined && /^B/i.test(era)) {
    throw new MarketHoursError(
      'INVALID_INSTANT',
      'Instants before 1 AD are not supported',
      { epochMs, era },
    );
  }

  // Some ICU builds render midnight as hour 24 of the same civil date rather
  // than hour 0. `hourCycle: 'h23'` should prevent it; this makes it moot.
  if (hour === 24) hour = 0;

  // `formatToParts` has no millisecond field. Every real zone offset is a whole
  // number of seconds, so the sub-second component is carried straight through
  // from the instant. The double modulo keeps it positive before 1970.
  const millisecond =
    ((epochMs % MS_PER_SECOND) + MS_PER_SECOND) % MS_PER_SECOND;

  const wallClockAsUtcMs =
    daysFromCivil(year, month, day) * MS_PER_DAY +
    hour * MS_PER_HOUR +
    minute * MS_PER_MINUTE +
    second * MS_PER_SECOND +
    millisecond;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    weekday: weekdayFromCivil(year, month, day),
    offsetMs: wallClockAsUtcMs - epochMs,
  };
}

/** Zone offset from UTC at a given instant, in milliseconds. */
export function offsetMsAt(timeZone: string, epochMs: number): number {
  return zonedPartsFromEpochMs(epochMs, timeZone).offsetMs;
}
