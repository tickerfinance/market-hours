/**
 * Every error this package throws is a {@link MarketHoursError} carrying a
 * stable `code`. Match on the code, never on the message — messages are for
 * humans and may change in a patch release.
 */
export type ErrorCode =
  | 'CALENDAR_HORIZON'
  | 'INVALID_INSTANT'
  | 'INVALID_DATE'
  | 'INVALID_TIME_ZONE'
  | 'TIME_ZONE_UNAVAILABLE'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'NONEXISTENT_LOCAL_TIME'
  | 'NO_TRANSITION_FOUND'
  | 'INVALID_VENUE_DEFINITION';

const BRAND = '__marketHoursError';

export class MarketHoursError extends Error {
  override readonly name: 'MarketHoursError' = 'MarketHoursError';
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.details = Object.freeze({ ...details });

    // Insurance for consumers who re-transpile this package down to ES5, where
    // subclassing a built-in otherwise loses the prototype chain.
    Object.setPrototypeOf(this, MarketHoursError.prototype);

    Object.defineProperty(this, BRAND, {
      value: true,
      enumerable: false,
      writable: false,
    });
  }
}

/**
 * Prefer this over `instanceof`. This package ships both ESM and CommonJS
 * builds, so a bundle can legitimately contain two copies of the class and
 * `instanceof` would return false across the boundary. The brand does not care.
 */
export function isMarketHoursError(value: unknown): value is MarketHoursError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[BRAND] === true
  );
}
