import type { VenueData } from '../calendars/data.js';
import { MarketHoursError } from '../errors.js';
import type {
  ExchangePhase,
  Market,
  Service,
  ServicePhase,
  Venue,
  VenueType,
} from '../types.js';
import { createVenue } from './venue.js';

/**
 * There is deliberately no string-keyed registry of shipped venues.
 *
 * A registry has to reference every calendar it can name, which defeats
 * tree-shaking: importing it to ask about one exchange drags in every other
 * one. Instead each venue is its own module — `market-hours/xlon` exports a
 * built `XLON` — so a bundler keeps exactly what a consumer asked for.
 *
 * It also removes a whole class of bug: with no shared namespace, an ISO 10383
 * MIC issued in future cannot collide with a news service code.
 */
function define(data: VenueData, expected: VenueType): Venue<never> {
  if (data === null || typeof data !== 'object') {
    throw new MarketHoursError(
      'INVALID_VENUE_DEFINITION',
      'A venue definition object is required. Import one, e.g. ' +
        "`import { XLON_CALENDAR } from 'market-hours/xlon'`, or supply your own. " +
        'If you only want to query a venue this package ships, import the venue ' +
        "itself — `import { XLON } from 'market-hours/xlon'` — and skip defineMarket.",
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
  return createVenue<never>(data);
}

/**
 * Builds an exchange from calendar data.
 *
 * **You do not need this to use a venue this package ships.** Import the venue
 * itself and query it:
 *
 * ```ts
 * import { XLON } from 'market-hours/xlon';
 * XLON.isOpen('2026-12-24T14:00:00Z'); // false — half day
 * ```
 *
 * Reach for `defineMarket` for an exchange we do not ship, or to change one we
 * do — a longer horizon, a correction you need before the next release:
 *
 * ```ts
 * import { defineMarket } from 'market-hours';
 * import { XLON_CALENDAR } from 'market-hours/xlon';
 *
 * const lse = defineMarket({
 *   ...XLON_CALENDAR,
 *   coverage: { from: XLON_CALENDAR.coverage.from, through: '2030-12-31' },
 * });
 * ```
 *
 * Hold the result at module scope; it is immutable and caches its own day
 * schedules, so building it per request throws that cache away each time.
 */
export function defineMarket(data: VenueData<'exchange'>): Market {
  return define(data, 'exchange') as unknown as Venue<ExchangePhase>;
}

/** The news-service counterpart of {@link defineMarket}. */
export function defineService(data: VenueData<'news-service'>): Service {
  return define(data, 'news-service') as unknown as Venue<ServicePhase>;
}
