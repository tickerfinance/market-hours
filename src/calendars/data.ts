import type { Phase, VenueType } from '../types.js';

/** One session in a venue's day, as local wall-clock `HH:mm` strings. */
export interface SessionTemplate {
  readonly phase: Phase;
  readonly start: string;
  readonly end: string;
}

export interface HolidayEntry {
  readonly date: string; // YYYY-MM-DD
  readonly name: string;
}

/** A date whose sessions differ from the venue's normal day. */
export interface EarlyCloseEntry {
  readonly date: string; // YYYY-MM-DD
  readonly sessions: readonly SessionTemplate[];
}

export interface SourceEntry {
  readonly what: string;
  readonly url: string;
  readonly division?: string;
  readonly licence: string;
  readonly retrievedAt: string;
  readonly method?: string;
}

/**
 * The shape of `data/<ID>.json`, and of anything passed to `defineMarket` or
 * `defineService`. Every date is explicit: there are no rules to evaluate and
 * nothing is inferred at runtime.
 */
export interface VenueData<T extends VenueType = VenueType> {
  readonly id: string;
  /**
   * Generic so the shipped calendars can declare which they are. `defineMarket`
   * takes `VenueData<'exchange'>`, so passing a news service is a type error
   * rather than only a runtime one.
   */
  readonly type: T;
  readonly name: string;
  readonly timeZone: string;
  /** Weekday numbers that are never trading days. 0 = Sunday. */
  readonly weekend: readonly number[];
  readonly sessions: readonly SessionTemplate[];
  readonly coverage: {
    readonly from: string;
    /** Last date for which holidays have been verified. */
    readonly through: string;
  };
  readonly sources: readonly SourceEntry[];
  readonly holidays: readonly HolidayEntry[];
  readonly earlyCloses: readonly EarlyCloseEntry[];
}
