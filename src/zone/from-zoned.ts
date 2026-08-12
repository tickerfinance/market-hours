import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  civilFromDays,
  daysFromCivil,
  isValidCivilDate,
} from '../core/civil-date.js';
import { MarketHoursError } from '../errors.js';
import { zonedPartsFromEpochMs } from './to-zoned.js';

/**
 * What to do when a local time does not correspond to exactly one instant.
 *
 * - `compatible` — the Temporal default: for a repeated hour take the earlier
 *   instant; for a skipped hour shift forward by the length of the gap.
 * - `earlier` / `later` — pick a side explicitly.
 * - `reject` — throw. Use this when a wrong answer is worse than an error.
 */
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

export interface ZonedPartsInput {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour?: number; // 0-24, 24 meaning midnight ending the day
  readonly minute?: number;
  readonly second?: number;
  readonly millisecond?: number;
}

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function wallClockFromMs(wallMs: number): WallClock {
  const days = Math.floor(wallMs / MS_PER_DAY);
  const { year, month, day } = civilFromDays(days);
  let rest = wallMs - days * MS_PER_DAY;
  const hour = Math.floor(rest / MS_PER_HOUR);
  rest -= hour * MS_PER_HOUR;
  const minute = Math.floor(rest / MS_PER_MINUTE);
  rest -= minute * MS_PER_MINUTE;
  const second = Math.floor(rest / MS_PER_SECOND);
  return { year, month, day, hour, minute, second };
}

function matches(epochMs: number, want: WallClock, timeZone: string): boolean {
  const got = zonedPartsFromEpochMs(epochMs, timeZone);
  return (
    got.year === want.year &&
    got.month === want.month &&
    got.day === want.day &&
    got.hour === want.hour &&
    got.minute === want.minute &&
    got.second === want.second
  );
}

/**
 * Converts a wall-clock time in `timeZone` to the instant it names.
 *
 * The offset cannot simply be looked up, because the offset depends on the
 * instant and the instant is what we are solving for. So we probe the offset a
 * day either side, generate a candidate from each, and keep the ones that
 * actually round-trip. Exactly one survivor is the normal case; two means the
 * local time is repeated (clocks went back) and none means it was skipped
 * (clocks went forward).
 */
export function epochMsFromZonedParts(
  input: ZonedPartsInput,
  timeZone: string,
  disambiguation: Disambiguation = 'compatible',
): number {
  const hour = input.hour ?? 0;
  const minute = input.minute ?? 0;
  const second = input.second ?? 0;
  const millisecond = input.millisecond ?? 0;

  if (!isValidCivilDate(input.year, input.month, input.day)) {
    throw new MarketHoursError(
      'INVALID_DATE',
      `Not a real calendar date: ${input.year}-${input.month}-${input.day}`,
      { ...input },
    );
  }

  const wallMs =
    daysFromCivil(input.year, input.month, input.day) * MS_PER_DAY +
    hour * MS_PER_HOUR +
    minute * MS_PER_MINUTE +
    second * MS_PER_SECOND +
    millisecond;

  const want = wallClockFromMs(wallMs);

  const offsetBefore = zonedPartsFromEpochMs(
    wallMs - MS_PER_DAY,
    timeZone,
  ).offsetMs;
  const offsetAfter = zonedPartsFromEpochMs(
    wallMs + MS_PER_DAY,
    timeZone,
  ).offsetMs;

  const candidates =
    offsetBefore === offsetAfter
      ? [wallMs - offsetBefore]
      : [wallMs - offsetBefore, wallMs - offsetAfter];

  const valid = candidates.filter((candidate) =>
    matches(candidate, want, timeZone),
  );

  if (valid.length === 1) return valid[0] as number;

  if (valid.length > 1) {
    const earlier = Math.min(...valid);
    const later = Math.max(...valid);
    if (disambiguation === 'reject') {
      throw new MarketHoursError(
        'AMBIGUOUS_LOCAL_TIME',
        `Local time occurs twice in ${timeZone} (clocks went back)`,
        { timeZone, earlier, later },
      );
    }
    return disambiguation === 'later' ? later : earlier;
  }

  // No candidate round-trips: the local time was skipped by a forward jump.
  const gapMs = offsetAfter - offsetBefore;
  if (disambiguation === 'reject') {
    throw new MarketHoursError(
      'NONEXISTENT_LOCAL_TIME',
      `Local time does not exist in ${timeZone} (clocks went forward)`,
      { timeZone, gapMs },
    );
  }
  // `earlier` shifts back by the gap, `compatible` and `later` shift forward.
  return disambiguation === 'earlier'
    ? wallMs - offsetAfter
    : wallMs - offsetBefore;
}
