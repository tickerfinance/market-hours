# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/). Note that **calendar data changes are a minor
release, never a patch** — they change observable behaviour for some inputs.

## [Unreleased]

## [0.1.0]

First release.

### Added

- `getMarket(mic)` for exchanges and `getService(id)` for news services, returning a venue bound to
  its calendar.
- `isOpen` (continuous trading only), `inSession` (auctions included), `isTradingDay`, `getStatus`,
  `getSchedule`, `nextTransition`, `nextOpen`, `nextClose` and `getCoverage`.
- `defineMarket` and `defineService` for calendars this package does not ship, with no global
  registry mutation.
- Time-zone primitives: `toZonedParts`, `fromZonedParts`, `getTimeZoneOffsetMs` and
  `getTimeZoneSupport`.
- **XLON** (London Stock Exchange): opening auction 07:50–08:00, continuous trading 08:00–16:30,
  closing auction 16:30–16:35, with England and Wales bank holidays and the 12:30 Christmas Eve and
  New Year's Eve early closes. Verified 2019-01-01 through 2028-12-31.
- **RNS** (Regulatory News Service): 07:00–19:30 on weekdays, the same holidays, and a 13:30 early
  close on 24 and 31 December.
- Typed errors with stable codes, and `isMarketHoursError` for checks that survive the ESM and
  CommonJS boundary.

### Notes

- Sessions are half-open, `[start, end)`, compared on epoch milliseconds. 16:29:59.999 is `open`;
  16:30:00.000 is `closing-auction`.
- An ISO string with no offset is read as **UTC**, never as host-local time.
- Runtimes that lack usable IANA time-zone data get a thrown `TIME_ZONE_UNAVAILABLE` rather than a
  plausible wrong answer. Probe with `getTimeZoneSupport()`.

[Unreleased]: https://github.com/tickerfinance/market-hours/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tickerfinance/market-hours/releases/tag/v0.1.0
