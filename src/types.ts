import type { InstantInput } from './instant.js';

export type { InstantInput } from './instant.js';

/** A calendar date in the venue's own time zone, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Either an instant or a `YYYY-MM-DD` civil date in the venue's time zone. */
export type DateInput = InstantInput | IsoDate;

/**
 * What an exchange is doing right now.
 *
 * `open` means the continuous order book only. The auctions are separate
 * phases because "the market is open" and "orders are executing in the closing
 * auction" are different questions with different answers.
 */
export type ExchangePhase =
  'closed' | 'pre-open-auction' | 'open' | 'closing-auction';

/** A news service is either accepting and releasing announcements, or not. */
export type ServicePhase = 'closed' | 'open';

export type Phase = ExchangePhase | ServicePhase;

export type VenueType = 'exchange' | 'news-service';

/**
 * A half-open interval: `start` is included, `end` is excluded.
 *
 * Sessions tile the day, so every instant belongs to exactly one of them.
 * 16:29:59.999 is inside the `open` session; 16:30:00.000 is not.
 */
export interface Interval {
  readonly start: Date;
  readonly end: Date;
}

export interface Session<P extends Phase = Phase> extends Interval {
  readonly phase: P;
}

export interface Transition<P extends Phase = Phase> {
  readonly at: Date;
  readonly from: P;
  readonly to: P;
}

export interface DaySchedule<P extends Phase = Phase> {
  readonly venueId: string;
  readonly date: IsoDate;
  /** Sorted, non-overlapping, half-open. Empty on a non-trading day. */
  readonly sessions: readonly Session<P>[];
  /**
   * The first session's start and the last session's end, or null on a
   * non-trading day.
   *
   * `dayEnd` exists so nobody has to reach into `sessions` for "when does this
   * venue actually shut today" — which is also how you handle a short day
   * without writing a clock time down.
   *
   * Deliberately not named `open`/`close`: an exchange opens in stages, so the
   * first session is usually the opening auction rather than the phase called
   * `open`. If you want continuous trading specifically, ask for it —
   * `sessions.find((s) => s.phase === 'open')` — rather than assuming the day
   * starts with it.
   */
  readonly dayStart: Date | null;
  readonly dayEnd: Date | null;
  /** The holiday's name if the venue is closed for one, else null. */
  readonly holiday: string | null;
}

export interface Status<P extends Phase = Phase> {
  readonly venueId: string;
  /** The instant actually evaluated, after normalising the input. */
  readonly at: Date;
  readonly localDate: IsoDate;
  /** `HH:mm:ss.SSS` in the venue's time zone. */
  readonly localTime: string;
  readonly phase: P;
  /** Continuous trading only. See {@link Status.inSession} for auctions. */
  readonly isOpen: boolean;
  /** Any live phase, auctions included. */
  readonly inSession: boolean;
  readonly holiday: string | null;
  readonly currentSession: Session<P> | null;
}

export interface ProvenanceEntry {
  readonly what: string;
  readonly url: string;
  readonly licence: string;
  readonly retrievedAt: string;
  readonly division?: string;
  readonly method?: string;
}

export interface Coverage {
  readonly venueId: string;
  readonly from: IsoDate;
  /** Last date for which holidays have been verified against a source. */
  readonly through: IsoDate;
  readonly sources: readonly ProvenanceEntry[];
}

/**
 * A venue bound to its calendar.
 *
 * The ones this package ships are already built — `import { XLON } from
 * 'market-hours/xlon'`. `defineMarket` and `defineService` build others; hold
 * the result at module scope, because a venue caches its own day schedules and
 * two calls produce two independent caches.
 */
export interface Venue<P extends Phase = Phase> {
  readonly id: string;
  readonly type: VenueType;
  readonly name: string;
  readonly timeZone: string;

  /** Continuous trading only. Auctions are not open; see {@link Venue.inSession}. */
  isOpen(at?: InstantInput): boolean;
  /** Any live session, auctions included. */
  inSession(at?: InstantInput): boolean;
  /** Whether the venue trades at all on this date. */
  isTradingDay(date?: DateInput): boolean;

  getStatus(at?: InstantInput): Status<P>;
  getSchedule(date?: DateInput): DaySchedule<P>;

  nextTransition(at?: InstantInput): Transition<P>;
  /** The next instant continuous trading starts. */
  nextOpen(at?: InstantInput): Date;
  /** The next instant continuous trading ends. */
  nextClose(at?: InstantInput): Date;

  /**
   * Whether the calendar covers this date — that is, whether queries *about*
   * this date will answer rather than throw.
   *
   * Assert on it at **deploy time or in CI**, not at startup. A long-lived
   * serverless process has no startup that knows the time, and the only clock
   * available there is the one this package exists to stop you reading.
   *
   * Forward-looking calls can still reach past the horizon from a covered date:
   * `nextOpen` on the last covered Friday is asking about an uncovered Monday.
   */
  covers(date: DateInput): boolean;

  getCoverage(): Coverage;
}

export type Market = Venue<ExchangePhase>;
export type Service = Venue<ServicePhase>;
