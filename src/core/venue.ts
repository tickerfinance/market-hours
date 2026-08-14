import type { SessionTemplate, VenueData } from '../calendars/data.js';
import { MarketHoursError } from '../errors.js';
import { toEpochMs, type InstantInput } from '../instant.js';
import type {
  Coverage,
  DateInput,
  DaySchedule,
  Phase,
  QueryOptions,
  Session,
  Status,
  Transition,
  Venue,
  VenueOptions,
} from '../types.js';
import { assertTimeZoneSupport } from '../zone/capability.js';
import { epochMsFromZonedParts } from '../zone/from-zoned.js';
import { zonedPartsFromEpochMs } from '../zone/to-zoned.js';
import {
  civilFromDays,
  daysFromCivil,
  formatIsoDate,
  formatWallTime,
  parseIsoDate,
  parseWallTime,
} from './civil-date.js';

/**
 * How far forward the transition search will walk before giving up. Real venues
 * never close for a month; this is a backstop so the search is total rather
 * than potentially unbounded.
 */
const MAX_LOOKAHEAD_DAYS = 30;

/** Plans are cached per venue. Bounded so a date-sweeping caller cannot leak. */
const MAX_CACHED_DAYS = 512;

const DEFAULT_INCLUDE: readonly Phase[] = ['open'];

interface PlannedSession {
  readonly phase: Phase;
  readonly startMs: number;
  readonly endMs: number;
}

interface DayPlan {
  readonly date: string;
  readonly holiday: string | null;
  readonly beyondCoverage: boolean;
  readonly sessions: readonly PlannedSession[];
}

interface Prepared {
  readonly data: VenueData;
  readonly strict: boolean;
  /** Warn-once latch, so a tick loop cannot flood the log. */
  warned: boolean;
  readonly holidays: Map<string, string>;
  readonly earlyCloses: Map<string, readonly SessionTemplate[]>;
  readonly weekend: Set<number>;
  readonly plans: Map<string, DayPlan>;
}

function invalidDefinition(message: string, details: object): MarketHoursError {
  return new MarketHoursError('INVALID_VENUE_DEFINITION', message, {
    ...details,
  });
}

function validateSessions(
  venueId: string,
  label: string,
  sessions: readonly SessionTemplate[],
): void {
  let previousEnd = -1;
  for (const session of sessions) {
    const start = parseWallTime(session.start);
    const end = parseWallTime(session.end);
    if (start === null || end === null) {
      throw invalidDefinition(
        `${venueId}: ${label} has a session with an unparseable time`,
        { session },
      );
    }
    if (end <= start) {
      throw invalidDefinition(
        `${venueId}: ${label} has a session ending at or before it starts`,
        { session },
      );
    }
    if (start < previousEnd) {
      throw invalidDefinition(
        `${venueId}: ${label} sessions must be sorted and must not overlap`,
        { session },
      );
    }
    previousEnd = end;
  }
}

export function prepare(data: VenueData, strict = true): Prepared {
  if (!/^[A-Z0-9]{2,12}$/.test(data.id)) {
    throw invalidDefinition(
      'Venue id must be 2-12 uppercase letters or digits',
      { id: data.id },
    );
  }
  if (data.sessions.length === 0) {
    throw invalidDefinition(`${data.id}: at least one session is required`, {
      id: data.id,
    });
  }
  if (parseIsoDate(data.coverage.from) === null) {
    throw invalidDefinition(`${data.id}: coverage.from is not a date`, {
      from: data.coverage.from,
    });
  }
  if (parseIsoDate(data.coverage.through) === null) {
    throw invalidDefinition(`${data.id}: coverage.through is not a date`, {
      through: data.coverage.through,
    });
  }

  validateSessions(data.id, 'sessions', data.sessions);

  const holidays = new Map<string, string>();
  for (const holiday of data.holidays) {
    if (parseIsoDate(holiday.date) === null) {
      throw invalidDefinition(`${data.id}: holiday date is not a date`, {
        holiday,
      });
    }
    holidays.set(holiday.date, holiday.name);
  }

  const earlyCloses = new Map<string, readonly SessionTemplate[]>();
  for (const entry of data.earlyCloses) {
    if (parseIsoDate(entry.date) === null) {
      throw invalidDefinition(`${data.id}: early close date is not a date`, {
        entry,
      });
    }
    validateSessions(data.id, `earlyCloses[${entry.date}]`, entry.sessions);
    earlyCloses.set(entry.date, entry.sessions);
  }

  return {
    data,
    strict,
    warned: false,
    holidays,
    earlyCloses,
    weekend: new Set(data.weekend),
    plans: new Map(),
  };
}

function isCovered(prepared: Prepared, days: number): boolean {
  const { year, month, day } = civilFromDays(days);
  const date = formatIsoDate(year, month, day);
  const { coverage } = prepared.data;
  return date >= coverage.from && date <= coverage.through;
}

/**
 * Past the calendar's horizon we know the weekends and the session times but
 * not the holidays, so an answer is a guess. Guessing is what this package
 * exists to stop: it already refuses when the runtime's time-zone data cannot
 * be trusted, and stale calendar data is the same failure with a slower fuse.
 * A pinned dependency would otherwise report the venue open on Christmas Day
 * for years without a murmur.
 */
function guardHorizon(prepared: Prepared, plan: DayPlan): void {
  if (!plan.beyondCoverage) return;
  const { coverage, id } = {
    coverage: prepared.data.coverage,
    id: prepared.data.id,
  };

  // Which end was crossed changes the advice. A release extends `through`; no
  // release will ever add years before `from`, so telling someone running a
  // backfill to upgrade sends them after a fix that does not exist.
  const side = plan.date < coverage.from ? 'before' : 'after';
  const bound = side === 'before' ? coverage.from : coverage.through;
  const escapes =
    'Supply your own calendar to defineMarket/defineService, or pass { strict: false } to answer from weekends and session times alone.';

  if (prepared.strict) {
    throw new MarketHoursError(
      'CALENDAR_HORIZON',
      `${id} has verified holidays for ${coverage.from} to ${coverage.through}, and ${plan.date} is ${side} that. ` +
        (side === 'after'
          ? `Upgrade market-hours to extend the calendar past ${bound}. ${escapes}`
          : `Upgrading will not add dates before ${bound}. ${escapes}`),
      {
        venueId: id,
        date: plan.date,
        from: coverage.from,
        through: coverage.through,
        side,
      },
    );
  }

  if (!prepared.warned) {
    prepared.warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[market-hours] ${id}: ${plan.date} is outside the verified calendar (${coverage.from} to ${coverage.through}). ` +
        `Answers ignore any holiday ${side} ${bound}. Check \`beyondCoverage\` on the result` +
        (side === 'after' ? ', or upgrade the package.' : '.'),
    );
  }
}

function buildPlan(prepared: Prepared, days: number): DayPlan {
  const { year, month, day } = civilFromDays(days);
  const date = formatIsoDate(year, month, day);
  const { data } = prepared;

  const beyondCoverage =
    date < data.coverage.from || date > data.coverage.through;

  const holiday = prepared.holidays.get(date) ?? null;
  const weekday = (((days + 4) % 7) + 7) % 7;

  if (holiday !== null || prepared.weekend.has(weekday)) {
    return { date, holiday, beyondCoverage, sessions: [] };
  }

  const templates = prepared.earlyCloses.get(date) ?? data.sessions;
  const sessions = templates.map((template) => ({
    phase: template.phase,
    startMs: wallTimeToEpochMs(data.timeZone, year, month, day, template.start),
    endMs: wallTimeToEpochMs(data.timeZone, year, month, day, template.end),
  }));

  return { date, holiday, beyondCoverage, sessions };
}

function wallTimeToEpochMs(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  wallTime: string,
): number {
  const minutes = parseWallTime(wallTime) as number;
  return epochMsFromZonedParts(
    {
      year,
      month,
      day,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    timeZone,
  );
}

function planForDays(prepared: Prepared, days: number): DayPlan {
  const key = String(days);
  const cached = prepared.plans.get(key);
  if (cached !== undefined) {
    guardHorizon(prepared, cached);
    return cached;
  }

  const plan = buildPlan(prepared, days);
  if (prepared.plans.size >= MAX_CACHED_DAYS) prepared.plans.clear();
  prepared.plans.set(key, plan);
  guardHorizon(prepared, plan);
  return plan;
}

function dayNumberOfInstant(prepared: Prepared, epochMs: number): number {
  const parts = zonedPartsFromEpochMs(epochMs, prepared.data.timeZone);
  return daysFromCivil(parts.year, parts.month, parts.day);
}

function phaseIn(plan: DayPlan, epochMs: number): Phase {
  for (const session of plan.sessions) {
    if (epochMs >= session.startMs && epochMs < session.endMs) {
      return session.phase;
    }
  }
  return 'closed';
}

function phaseAt(prepared: Prepared, epochMs: number): Phase {
  return phaseIn(
    planForDays(prepared, dayNumberOfInstant(prepared, epochMs)),
    epochMs,
  );
}

interface RawTransition {
  readonly at: number;
  readonly from: Phase;
  readonly to: Phase;
}

/**
 * The next instant at which the phase changes, strictly after `epochMs`.
 *
 * Boundaries come from the day's sessions. Because sessions tile the day, the
 * end of one is the start of the next, so a single sorted sweep of starts and
 * ends is enough.
 */
function nextRawTransition(prepared: Prepared, epochMs: number): RawTransition {
  const startDay = dayNumberOfInstant(prepared, epochMs);

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    const plan = planForDays(prepared, startDay + offset);
    const boundaries: number[] = [];
    for (const session of plan.sessions) {
      boundaries.push(session.startMs, session.endMs);
    }
    boundaries.sort((a, b) => a - b);

    for (const boundary of boundaries) {
      if (boundary > epochMs) {
        return {
          at: boundary,
          from: phaseAt(prepared, epochMs),
          to: phaseAt(prepared, boundary),
        };
      }
    }
  }

  throw new MarketHoursError(
    'NO_TRANSITION_FOUND',
    `${prepared.data.id} has no phase change within ${MAX_LOOKAHEAD_DAYS} days of the given instant`,
    {
      venueId: prepared.data.id,
      epochMs,
      maxLookaheadDays: MAX_LOOKAHEAD_DAYS,
    },
  );
}

function includeSet(
  options: QueryOptions<Phase> | undefined,
): ReadonlySet<Phase> {
  return new Set(options?.include ?? DEFAULT_INCLUDE);
}

function resolveDays(prepared: Prepared, date: DateInput | undefined): number {
  if (typeof date === 'string') {
    const civil = parseIsoDate(date);
    if (civil !== null)
      return daysFromCivil(civil.year, civil.month, civil.day);
  }
  return dayNumberOfInstant(prepared, toEpochMs(date));
}

function toSession<P extends Phase>(session: PlannedSession): Session<P> {
  return {
    phase: session.phase as P,
    start: new Date(session.startMs),
    end: new Date(session.endMs),
  };
}

/** Binds a prepared calendar to the public {@link Venue} surface. */
export function createVenue<P extends Phase>(
  data: VenueData,
  options?: VenueOptions,
): Venue<P> {
  const prepared = prepare(data, options?.strict ?? true);
  const { timeZone } = data;

  function ready(): void {
    assertTimeZoneSupport(timeZone);
  }

  function statusAt(
    at: InstantInput | undefined,
    options?: QueryOptions<Phase>,
  ) {
    ready();
    const epochMs = toEpochMs(at);
    const parts = zonedPartsFromEpochMs(epochMs, timeZone);
    const plan = planForDays(
      prepared,
      daysFromCivil(parts.year, parts.month, parts.day),
    );
    const current =
      plan.sessions.find(
        (session) => epochMs >= session.startMs && epochMs < session.endMs,
      ) ?? null;
    const phase: Phase = current?.phase ?? 'closed';
    const included = includeSet(options);

    // Deliberately no forward search here. `isOpen` needs the phase and nothing
    // else, and a status that eagerly resolved the next transition would throw
    // for a perfectly covered date whenever the *next* one fell past the
    // horizon — which made `covers()` unable to promise what it was for.
    const status: Status<P> = {
      venueId: data.id,
      at: new Date(epochMs),
      localDate: plan.date,
      localTime: formatWallTime(
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond,
      ),
      phase: phase as P,
      isOpen: included.has(phase),
      inSession: phase !== 'closed',
      holiday: plan.holiday,
      currentSession: current === null ? null : toSession<P>(current),
      beyondCoverage: plan.beyondCoverage,
    };
    return status;
  }

  function scan(
    at: InstantInput | undefined,
    options: QueryOptions<Phase> | undefined,
    wantEntry: boolean,
  ): Date {
    ready();
    const included = includeSet(options);
    let cursor = toEpochMs(at);

    for (let step = 0; step < MAX_LOOKAHEAD_DAYS * 8; step += 1) {
      const transition = nextRawTransition(prepared, cursor);
      const enters =
        !included.has(transition.from) && included.has(transition.to);
      const leaves =
        included.has(transition.from) && !included.has(transition.to);
      if (wantEntry ? enters : leaves) return new Date(transition.at);
      cursor = transition.at;
    }

    throw new MarketHoursError(
      'NO_TRANSITION_FOUND',
      `${data.id} does not ${wantEntry ? 'open' : 'close'} within the search window`,
      { venueId: data.id },
    );
  }

  return {
    id: data.id,
    type: data.type,
    name: data.name,
    timeZone,

    isOpen(at, options) {
      return statusAt(at, options).isOpen;
    },

    inSession(at, options) {
      return statusAt(at, options).inSession;
    },

    isTradingDay(date) {
      ready();
      return (
        planForDays(prepared, resolveDays(prepared, date)).sessions.length > 0
      );
    },

    getStatus(at, options) {
      return statusAt(at, options);
    },

    getSchedule(date) {
      ready();
      const plan = planForDays(prepared, resolveDays(prepared, date));
      const first = plan.sessions[0];
      const last = plan.sessions[plan.sessions.length - 1];
      const schedule: DaySchedule<P> = {
        venueId: data.id,
        date: plan.date,
        sessions: plan.sessions.map((session) => toSession<P>(session)),
        dayStart: first === undefined ? null : new Date(first.startMs),
        dayEnd: last === undefined ? null : new Date(last.endMs),
        holiday: plan.holiday,
        beyondCoverage: plan.beyondCoverage,
      };
      return schedule;
    },

    nextTransition(at) {
      ready();
      const transition = nextRawTransition(prepared, toEpochMs(at));
      const result: Transition<P> = {
        at: new Date(transition.at),
        from: transition.from as P,
        to: transition.to as P,
      };
      return result;
    },

    nextOpen(at, options) {
      return scan(at, options, true);
    },

    nextClose(at, options) {
      return scan(at, options, false);
    },

    covers(date) {
      return isCovered(prepared, resolveDays(prepared, date));
    },

    getCoverage(): Coverage {
      return {
        venueId: data.id,
        from: data.coverage.from,
        through: data.coverage.through,
        sources: data.sources.map((source) => ({ ...source })),
      };
    },
  };
}
