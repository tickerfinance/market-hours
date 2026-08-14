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
   * When the venue first opens and finally closes on this date, or null on a
   * non-trading day.
   *
   * These exist so nobody has to reach into `sessions` and take the last
   * element to answer "when does today actually end" — which is also the only
   * way to notice a short day without hardcoding a clock time.
   */
  readonly open: Date | null;
  readonly close: Date | null;
  /** The holiday's name if the venue is closed for one, else null. */
  readonly holiday: string | null;
  /** True past the calendar's verified horizon — holidays may be missing. */
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
  readonly nextTransition: Transition<P>;
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

export interface VenueSummary {
  readonly id: string;
  readonly type: VenueType;
  readonly name: string;
  readonly timeZone: string;
}

/**
 * A venue bound to its calendar. Get one with `getMarket` or `getService`, hold
 * it at module scope, and every call site reads as `venue.isOpen(at)`.
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
   * Whether the calendar actually covers this date. Assert on it at startup
   * rather than comparing `getCoverage().through` by hand.
   */
  covers(date: DateInput): boolean;

  getCoverage(): Coverage;
}

export type Market = Venue<ExchangePhase>;
export type Service = Venue<ServicePhase>;
