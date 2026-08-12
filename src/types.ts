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

export interface QueryOptions {
  /**
   * Which phases count as "open" for {@link Venue.isOpen}. Defaults to
   * `['open']`. Pass `['open', 'closing-auction']` to include the auction.
   */
  readonly include?: readonly Phase[];
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
  isOpen(at?: InstantInput, options?: QueryOptions): boolean;
  /** Any live session, auctions included. */
  inSession(at?: InstantInput, options?: QueryOptions): boolean;
  /** Whether the venue trades at all on this date. */
  isTradingDay(date?: DateInput): boolean;

  getStatus(at?: InstantInput, options?: QueryOptions): Status<P>;
  getSchedule(date?: DateInput): DaySchedule<P>;

  nextTransition(at?: InstantInput, options?: QueryOptions): Transition<P>;
  nextOpen(at?: InstantInput, options?: QueryOptions): Date;
  nextClose(at?: InstantInput, options?: QueryOptions): Date;

  getCoverage(): Coverage;
}

export type Market = Venue<ExchangePhase>;
export type Service = Venue<ServicePhase>;
