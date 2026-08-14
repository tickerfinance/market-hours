import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  daysFromCivil,
  isValidCivilDate,
} from './core/civil-date.js';
import { MarketHoursError } from './errors.js';

/**
 * An instant in time. A `Date`, epoch milliseconds, or an ISO 8601 string.
 *
 * **A string with no offset is read as UTC.** `'2026-12-24T09:00'` means
 * 09:00 UTC, not 09:00 wherever the machine happens to be. Bare
 * `new Date(string)` is host-local for some formats and UTC for others, and
 * that inconsistency is the single most common source of market-hours bugs.
 * Pass an explicit `Z` or `±HH:MM` whenever you have one.
 */
export type InstantInput = Date | number | string;

/** The maximum absolute value of a valid ECMAScript time value. */
const MAX_TIME_VALUE = 8.64e15;

// The offset minutes are optional because '+00' and '+01' are what most SQL
// databases emit, and rejecting them would be pedantry rather than safety.
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(?:([Zz])|([+-])(\d{2})(?::?(\d{2}))?)?)?$/;

function invalid(value: unknown, reason: string): MarketHoursError {
  return new MarketHoursError(
    'INVALID_INSTANT',
    `${reason}. Pass a Date, epoch milliseconds, or an ISO 8601 string such as '2026-12-24T09:00:00Z'`,
    { value: typeof value === 'symbol' ? String(value) : value },
  );
}

function parseIsoInstant(value: string): number {
  const match = ISO_INSTANT.exec(value);
  if (match === null) {
    throw invalid(value, `Not a recognised ISO 8601 instant: '${value}'`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCivilDate(year, month, day)) {
    throw invalid(value, `Not a real calendar date: '${value}'`);
  }

  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59) {
    throw invalid(value, `Time out of range: '${value}'`);
  }
  if (second > 59) {
    // 60 would be a leap second, which no ECMAScript time value can represent.
    throw invalid(value, `Second out of range: '${value}'`);
  }

  const fraction = match[7];
  const millisecond =
    fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'));

  let offsetMs = 0;
  const sign = match[9];
  if (sign !== undefined) {
    const offsetHours = Number(match[10]);
    const offsetMinutes = match[11] === undefined ? 0 : Number(match[11]);
    if (offsetHours > 23 || offsetMinutes > 59) {
      throw invalid(value, `Offset out of range: '${value}'`);
    }
    offsetMs =
      (sign === '-' ? -1 : 1) *
      (offsetHours * MS_PER_HOUR + offsetMinutes * MS_PER_MINUTE);
  }

  return (
    daysFromCivil(year, month, day) * MS_PER_DAY +
    hour * MS_PER_HOUR +
    minute * MS_PER_MINUTE +
    second * MS_PER_SECOND +
    millisecond -
    offsetMs
  );
}

/**
 * Normalises any accepted instant input to epoch milliseconds.
 * Omitting the value means "now".
 */
export function toEpochMs(value?: InstantInput): number {
  if (value === undefined) return Date.now();

  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw invalid(value, 'Date is Invalid Date');
    return ms;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalid(value, 'Epoch milliseconds must be a finite number');
    }
    if (Math.abs(value) > MAX_TIME_VALUE) {
      throw invalid(
        value,
        'Epoch milliseconds outside the representable range',
      );
    }
    return Math.trunc(value);
  }

  if (typeof value === 'string') return parseIsoInstant(value.trim());

  throw invalid(value, `Unsupported instant type '${typeof value}'`);
}
