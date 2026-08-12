import { toEpochMs, type InstantInput } from '../instant.js';
import { assertTimeZoneSupport } from './capability.js';
import {
  epochMsFromZonedParts,
  type Disambiguation,
  type ZonedPartsInput,
} from './from-zoned.js';
import { zonedPartsFromEpochMs, type ZonedParts } from './to-zoned.js';

/**
 * Wall-clock components of an instant in a given IANA time zone.
 *
 * ```ts
 * toZonedParts('2026-07-15T10:30:00Z', 'Europe/London').hour; // 11
 * ```
 */
export function toZonedParts(at: InstantInput, timeZone: string): ZonedParts {
  assertTimeZoneSupport(timeZone);
  return zonedPartsFromEpochMs(toEpochMs(at), timeZone);
}

/**
 * The instant named by a wall-clock time in a given zone.
 *
 * A local time can be ambiguous (the hour that repeats when clocks go back) or
 * nonexistent (the hour skipped when they go forward). `disambiguation`
 * decides; it defaults to `'compatible'`, matching Temporal.
 */
export function fromZonedParts(
  parts: ZonedPartsInput,
  timeZone: string,
  options?: { readonly disambiguation?: Disambiguation },
): Date {
  assertTimeZoneSupport(timeZone);
  return new Date(
    epochMsFromZonedParts(parts, timeZone, options?.disambiguation),
  );
}

/** The zone's offset from UTC at a given instant, in milliseconds. */
export function getTimeZoneOffsetMs(
  timeZone: string,
  at: InstantInput,
): number {
  assertTimeZoneSupport(timeZone);
  return zonedPartsFromEpochMs(toEpochMs(at), timeZone).offsetMs;
}
