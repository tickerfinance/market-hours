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

const built = new Map<string, Venue<never>>();

function instance(data: VenueData): Venue<never> {
  const existing = built.get(data.id);
  if (existing !== undefined) return existing;
  const venue = createVenue<never>(data);
  built.set(data.id, venue);
  return venue;
}

function lookup(id: string, expected: VenueType): Venue<never> {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new MarketHoursError('UNKNOWN_VENUE', 'A venue id is required', {
      id,
    });
  }
  const wanted = id.trim().toUpperCase();
  const data = BUILT_IN_VENUES.find((venue) => venue.id === wanted);

  if (data === undefined) {
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

  if (data.type !== expected) {
    throw new MarketHoursError(
      'UNKNOWN_VENUE',
      `'${wanted}' is a ${data.type}, not a ${expected}. Use ${
        data.type === 'exchange' ? 'getMarket' : 'getService'
      }() instead.`,
      { id: wanted, type: data.type, expected },
    );
  }

  return instance(data);
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
