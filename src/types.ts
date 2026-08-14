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
  /**
   * True outside the calendar's verified range — holidays may be missing.
   *
   * **Always `false` on a strict venue**, which is the default: the call throws
   * `CALENDAR_HORIZON` before it can return one of these. Reading it is only
   * meaningful under `{ strict: false }`.
   */
  readonly beyondCoverage: boolean;
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
  /**
   * True outside the calendar's verified range — holidays may be missing.
   *
   * **Always `false` on a strict venue**, which is the default: the call throws
   * `CALENDAR_HORIZON` before it can return one of these. Reading it is only
   * meaningful under `{ strict: false }`.
   */
  readonly beyondCoverage: boolean;
}

/**
 * Narrowed to the venue's own phases, so `include` cannot name a phase the
 * venue can never be in. A news service has no auctions, and
 * `rns.isOpen(at, { include: ['closing-auction'] })` should not compile rather
 * than quietly returning false forever.
 */
export interface QueryOptions<P extends Phase = Phase> {
  /**
   * Which phases count as "open" for {@link Venue.isOpen}. Defaults to
   * `['open']`. Pass `['open', 'closing-auction']` to include the auction.
   */
  readonly include?: readonly P[] | undefined;
}

export interface VenueOptions {
  /**
   * What to do about dates the calendar does not cover.
   *
   * `true` (the default) throws `CALENDAR_HORIZON`. Answering past the horizon
   * means guessing at holidays, and a package whose entire purpose is to know
   * whether the market is open should not guess — it already refuses when the
   * runtime's time-zone data cannot be trusted, and stale calendar data is the
   * same failure.
   *
   * `false` answers from weekends and session times alone, sets
   * `beyondCoverage` on the result, and warns once. Use it where a wrong
   * answer beats an exception — rendering a page, say — and check
   * `beyondCoverage` if it matters.
   */
  readonly strict?: boolean | undefined;
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
 * Build one with `defineMarket` or `defineService` and hold it at module scope:
 * it is immutable and caches its own day schedules, so two calls to
 * `defineMarket` produce two independent venues with separate caches. In a
 * codebase with several entry points, define it once and import it.
 */
export interface Venue<P extends Phase = Phase> {
  readonly id: string;
  readonly type: VenueType;
  readonly name: string;
  readonly timeZone: string;

  /** Continuous trading only, unless widened with `options.include`. */
  isOpen(at?: InstantInput, options?: QueryOptions<P>): boolean;
  /** Any live session, auctions included. */
  inSession(at?: InstantInput, options?: QueryOptions<P>): boolean;
  /** Whether the venue trades at all on this date. */
  isTradingDay(date?: DateInput): boolean;

  getStatus(at?: InstantInput, options?: QueryOptions<P>): Status<P>;
  getSchedule(date?: DateInput): DaySchedule<P>;

  nextTransition(at?: InstantInput, options?: QueryOptions<P>): Transition<P>;
  nextOpen(at?: InstantInput, options?: QueryOptions<P>): Date;
  nextClose(at?: InstantInput, options?: QueryOptions<P>): Date;

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
