import { MarketHoursError } from '../errors.js';

export interface TimeZoneSupport {
  readonly supported: boolean;
  readonly reason:
    'ok' | 'no-intl' | 'no-time-zone-support' | 'incorrect-offsets';
  readonly detail: string;
}

/**
 * Probes with hard-coded expected answers.
 *
 * Checking `typeof Intl !== 'undefined'` is not enough. Some engines accept an
 * IANA zone and then quietly format in UTC, which would make every London
 * answer an hour wrong for seven months of the year and never raise anything.
 * The only way to know the zone was actually applied is to ask a question whose
 * answer we already know.
 *
 * `Asia/Kolkata` proves offsets are applied at all, and its +05:30 catches
 * whole-hour assumptions. The two `America/New_York` probes straddle a DST
 * boundary, proving the runtime carries transition rules and not just a fixed
 * offset per zone.
 */
const PROBES: ReadonlyArray<{
  readonly timeZone: string;
  readonly epochMs: number;
  readonly expected: string;
}> = [
  {
    timeZone: 'Asia/Kolkata',
    epochMs: Date.UTC(2021, 0, 1, 0, 0, 0),
    expected: '2021-01-01 05:30',
  },
  {
    timeZone: 'America/New_York',
    epochMs: Date.UTC(2021, 0, 1, 12, 0, 0),
    expected: '2021-01-01 07:00',
  },
  {
    timeZone: 'America/New_York',
    epochMs: Date.UTC(2021, 6, 1, 12, 0, 0),
    expected: '2021-07-01 08:00',
  },
];

function probeFormat(timeZone: string, epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));

  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '??';

  return `${read('year')}-${read('month')}-${read('day')} ${read(
    'hour',
  )}:${read('minute')}`;
}

const cache = new Map<string, TimeZoneSupport>();

/**
 * Reports whether this runtime can answer time-zone questions correctly.
 *
 * Call it once at startup on a platform you do not control — React Native and
 * other Hermes builds may ship without IANA time-zone data.
 */
export function getTimeZoneSupport(timeZone = 'UTC'): TimeZoneSupport {
  const cached = cache.get(timeZone);
  if (cached !== undefined) return cached;

  const result = evaluate(timeZone);
  cache.set(timeZone, result);
  return result;
}

function evaluate(timeZone: string): TimeZoneSupport {
  if (
    typeof Intl === 'undefined' ||
    typeof Intl.DateTimeFormat !== 'function'
  ) {
    return {
      supported: false,
      reason: 'no-intl',
      detail: 'Intl.DateTimeFormat is not available in this runtime',
    };
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return {
      supported: false,
      reason: 'no-time-zone-support',
      detail: `This runtime rejected the IANA time zone ${timeZone}, which usually means it was built without time-zone data`,
    };
  }

  for (const probe of PROBES) {
    let actual: string;
    try {
      actual = probeFormat(probe.timeZone, probe.epochMs);
    } catch {
      return {
        supported: false,
        reason: 'no-time-zone-support',
        detail: `This runtime rejected the IANA time zone ${probe.timeZone}`,
      };
    }
    if (actual !== probe.expected) {
      return {
        supported: false,
        reason: 'incorrect-offsets',
        detail: `Time-zone data is wrong or ignored: ${probe.timeZone} should render ${probe.expected} but rendered ${actual}`,
      };
    }
  }

  return { supported: true, reason: 'ok', detail: 'Time-zone data verified' };
}

export function assertTimeZoneSupport(timeZone: string): void {
  const support = getTimeZoneSupport(timeZone);
  if (support.supported) return;
  throw new MarketHoursError('TIME_ZONE_UNAVAILABLE', support.detail, {
    timeZone,
    reason: support.reason,
  });
}

/** Test seam. Not exported from the package entry point. */
export function clearTimeZoneSupportCache(): void {
  cache.clear();
}
