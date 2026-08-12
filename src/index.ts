/**
 * market-hours — is the market open?
 *
 * Every function is pure and takes an optional instant, so "was the market open
 * at 14:00 on Christmas Eve" is a one-line assertion rather than a mock.
 *
 * ```ts
 * import { getMarket, getService } from 'market-hours';
 *
 * const lse = getMarket('XLON');
 * lse.isOpen();                            // now
 * lse.isOpen('2026-12-24T14:00:00Z');      // false, half day
 * lse.getStatus().phase;                   // 'open' | 'closing-auction' | ...
 * lse.nextOpen();
 *
 * getService('RNS').isOpen();
 * ```
 *
 * Sessions are half-open: `start` is included, `end` is excluded. On an
 * ordinary London day 16:29:59.999 is `open` and 16:30:00.000 is
 * `closing-auction`.
 */

export {
  defineMarket,
  defineService,
  getMarket,
  getService,
  listMarkets,
  listServices,
} from './core/registry.js';

export { MarketHoursError, isMarketHoursError } from './errors.js';
export type { ErrorCode } from './errors.js';

export { toEpochMs } from './instant.js';

export type {
  Coverage,
  DateInput,
  DaySchedule,
  ExchangePhase,
  InstantInput,
  Interval,
  IsoDate,
  Market,
  Phase,
  ProvenanceEntry,
  QueryOptions,
  Service,
  ServicePhase,
  Session,
  Status,
  Transition,
  Venue,
  VenueSummary,
  VenueType,
} from './types.js';

export type {
  EarlyCloseEntry,
  HolidayEntry,
  SessionTemplate,
  SourceEntry,
  VenueData,
} from './calendars/data.js';

// Time-zone primitives, public on purpose. Reaching for
// `new Date(d.toLocaleString('en-US', { timeZone }))` is the bug this package
// exists to remove, and people only reach for it because they need a wall
// clock. Here is one that is correct.
export { getTimeZoneSupport } from './zone/capability.js';
export type { TimeZoneSupport } from './zone/capability.js';

export { getTimeZoneOffsetMs, toZonedParts } from './zone/public.js';
export { fromZonedParts } from './zone/public.js';
export type { ZonedParts } from './zone/to-zoned.js';
export type { Disambiguation, ZonedPartsInput } from './zone/from-zoned.js';
