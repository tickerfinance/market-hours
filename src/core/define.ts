import type { VenueData } from '../calendars/data.js';
import { MarketHoursError } from '../errors.js';
import type {
  ExchangePhase,
  Market,
  Service,
  ServicePhase,
  Venue,
  VenueOptions,
  VenueType,
} from '../types.js';
import { createVenue } from './venue.js';

/**
 * There is deliberately no string-keyed registry of shipped venues.
 *
 * A registry has to reference every calendar it can name, which defeats
 * tree-shaking: importing it to ask about one exchange drags in every other
 * one. Instead each calendar is its own module, imported by name, so a bundler
 * keeps exactly what a consumer asked for and nothing else.
 *
 * ```ts
 * import { defineMarket } from 'market-hours';
 * import { XLON } from 'market-hours/xlon';
 *
 * const lse = defineMarket(XLON);
 * ```
 *
 * It also removes a whole class of bug: with no shared namespace, an ISO 10383
 * MIC issued in future cannot collide with a news service code.
 */
function define(
  data: VenueData,
  expected: VenueType,
  options: VenueOptions | undefined,
): Venue<never> {
  if (data === null || typeof data !== 'object') {
    throw new MarketHoursError(
      'INVALID_VENUE_DEFINITION',
      'A venue definition object is required. Import one, e.g. ' +
        "`import { XLON } from 'market-hours/xlon'`, or supply your own.",
      { data },
    );
  }
  if (data.type !== expected) {
    throw new MarketHoursError(
      'INVALID_VENUE_DEFINITION',
      `Definition type must be '${expected}', but this one is '${String(data.type)}'. Use ${
        expected === 'exchange' ? 'defineService' : 'defineMarket'
      }() instead.`,
      { id: data.id, type: data.type },
    );
  }
  return createVenue<never>(data, options);
}

/**
 * Builds an exchange from calendar data.
 *
 * ```ts
 * import { defineMarket } from 'market-hours';
 * import { XLON } from 'market-hours/xlon';
 *
 * const lse = defineMarket(XLON);
 * lse.isOpen('2026-12-24T14:00:00Z'); // false — half day
 * ```
 *
 * Hold the result at module scope; it is immutable and caches its own day
 * schedules.
 */
export function defineMarket(data: VenueData, options?: VenueOptions): Market {
  return define(data, 'exchange', options) as unknown as Venue<ExchangePhase>;
}

/** The news-service counterpart of {@link defineMarket}. */
export function defineService(
  data: VenueData,
  options?: VenueOptions,
): Service {
  return define(
    data,
    'news-service',
    options,
  ) as unknown as Venue<ServicePhase>;
}
