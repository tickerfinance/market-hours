import { BUILT_IN_VENUES } from '../calendars/built-in.generated.js';
import type { VenueData } from '../calendars/data.js';
import { MarketHoursError } from '../errors.js';
import type {
  ExchangePhase,
  Market,
  Service,
  ServicePhase,
  Venue,
  VenueSummary,
  VenueType,
} from '../types.js';
import { createVenue } from './venue.js';

/**
 * Every id is scoped by venue type, never looked up on its own.
 *
 * Exchange ids are ISO 10383 MICs, issued by an external registry that gains
 * codes without our involvement. News service ids are ordinary acronyms.
 * Nothing prevents a future MIC from matching a service code already shipped
 * here, so `XYZW` as an exchange and `XYZW` as a news service must be able to
 * coexist. Keying on the id alone would make one of them permanently
 * unreachable — and, worse, would report it as the wrong type rather than
 * failing.
 */
function key(type: VenueType, id: string): string {
  return `${type}:${id}`;
}

/** Exported for tests: the resolution rule, independent of what we ship. */
export function findVenue(
  venues: readonly VenueData[],
  id: string,
  type: VenueType,
): VenueData | undefined {
  return venues.find((venue) => venue.type === type && venue.id === id);
}

const built = new Map<string, Venue<never>>();

function instance(data: VenueData): Venue<never> {
  const cacheKey = key(data.type, data.id);
  const existing = built.get(cacheKey);
  if (existing !== undefined) return existing;
  const venue = createVenue<never>(data);
  built.set(cacheKey, venue);
  return venue;
}

function lookup(id: string, expected: VenueType): Venue<never> {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new MarketHoursError('UNKNOWN_VENUE', 'A venue id is required', {
      id,
    });
  }
  const wanted = id.trim().toUpperCase();
  const data = findVenue(BUILT_IN_VENUES, wanted, expected);

  if (data !== undefined) return instance(data);

  // Only once the correct namespace has been ruled out is it worth asking
  // whether the caller reached for the wrong lookup function.
  const otherType: VenueType =
    expected === 'exchange' ? 'news-service' : 'exchange';
  if (findVenue(BUILT_IN_VENUES, wanted, otherType) !== undefined) {
    throw new MarketHoursError(
      'UNKNOWN_VENUE',
      `'${wanted}' is a ${otherType}, not a ${expected}. Use ${
        otherType === 'exchange' ? 'getMarket' : 'getService'
      }() instead.`,
      { id: wanted, type: otherType, expected },
    );
  }

  const available = BUILT_IN_VENUES.filter(
    (venue) => venue.type === expected,
  ).map((venue) => venue.id);
  throw new MarketHoursError(
    'UNKNOWN_VENUE',
    `No built-in calendar for '${wanted}'. Available: ${available.join(', ')}. Supply your own with ${
      expected === 'exchange' ? 'defineMarket' : 'defineService'
    }().`,
    { id: wanted, expected, available },
  );
}

/**
 * An exchange, by its ISO 10383 operating MIC.
 *
 * Hold the result at module scope; it is immutable and caches its own day
 * schedules.
 *
 * ```ts
 * const lse = getMarket('XLON');
 * lse.isOpen('2026-12-24T14:00:00Z'); // false — half day
 * ```
 */
export function getMarket(mic: string): Market {
  return lookup(mic, 'exchange') as unknown as Venue<ExchangePhase>;
}

/**
 * A regulatory news service, by its short code.
 *
 * ```ts
 * const rns = getService('RNS');
 * rns.isOpen('2026-08-12T18:00:00Z'); // true
 * ```
 */
export function getService(id: string): Service {
  return lookup(id, 'news-service') as unknown as Venue<ServicePhase>;
}

function summarise(type: VenueType): readonly VenueSummary[] {
  return BUILT_IN_VENUES.filter((venue) => venue.type === type).map(
    (venue) => ({
      id: venue.id,
      type: venue.type,
      name: venue.name,
      timeZone: venue.timeZone,
    }),
  );
}

export function listMarkets(): readonly VenueSummary[] {
  return summarise('exchange');
}

export function listServices(): readonly VenueSummary[] {
  return summarise('news-service');
}

function define(data: VenueData, expected: VenueType): Venue<never> {
  if (data === null || typeof data !== 'object') {
    throw new MarketHoursError(
      'INVALID_VENUE_DEFINITION',
      'A venue definition object is required',
      { data },
    );
  }
  if (data.type !== expected) {
    throw new MarketHoursError(
      'INVALID_VENUE_DEFINITION',
      `Definition type must be '${expected}'`,
      { id: data.id, type: data.type },
    );
  }
  // Deliberately not registered globally: a caller's own calendar must never
  // change what getMarket('XLON') returns for anybody else.
  return createVenue<never>(data);
}

/**
 * Builds a market from your own calendar data without touching the global
 * registry. Use this for a venue this package does not ship.
 */
export function defineMarket(data: VenueData): Market {
  return define(data, 'exchange') as unknown as Venue<ExchangePhase>;
}

/** The news-service counterpart of {@link defineMarket}. */
export function defineService(data: VenueData): Service {
  return define(data, 'news-service') as unknown as Venue<ServicePhase>;
}
