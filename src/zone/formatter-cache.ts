import { MarketHoursError } from '../errors.js';

/**
 * The only thing this package needs from a date formatter.
 *
 * Declared structurally rather than as `Intl.DateTimeFormat` so no emitted
 * declaration file depends on the `Intl` namespace being present. That keeps
 * the shipped types usable from a consumer compiling against `lib: es5`, and
 * makes the stubbing in the tests honest rather than a cast.
 */
export interface ZoneFormatter {
  formatToParts(date: Date): readonly { type: string; value: string }[];
}

/**
 * Constructing a formatter costs orders of magnitude more than using one, and
 * this package formats on every query. One per zone, built once, is the
 * difference between a hot path and a hot spot.
 */
const formatters = new Map<string, ZoneFormatter>();

export function getFormatter(timeZone: string): ZoneFormatter {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) return cached;

  let formatter: ZoneFormatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `era` is requested so a BC year is detectable rather than silently
      // wrapping to a plausible-looking AD year.
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new MarketHoursError(
      'INVALID_TIME_ZONE',
      `Unknown or unsupported IANA time zone: ${timeZone}`,
      { timeZone },
    );
  }

  formatters.set(timeZone, formatter);
  return formatter;
}

/** Test seam. Not exported from the package entry point. */
export function clearFormatterCache(): void {
  formatters.clear();
}
