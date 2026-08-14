# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/). Note that **calendar data changes are a minor
release, never a patch** — they change observable behaviour for some inputs.

## [Unreleased]

Written as the delta from 0.1.0. Several things below were added and then removed again before
release; only where they landed is recorded.

### Changed — breaking

- **Venues are imported, not looked up, and arrive ready to query.** `getMarket('XLON')` and
  `getService('RNS')` are gone. `import { XLON } from 'market-hours/xlon'` and call `XLON.isOpen()`
  — no construction step, no registry. A string registry has to reference every calendar it can
  name, which made every consumer bundle all of them; importing by name lets a bundler drop what you
  never used. An XLON-only bundle is 20 KB minified with no trace of RNS, and CI fails if that
  regresses. Each venue module also exports its calendar as `XLON_CALENDAR` / `RNS_CALENDAR`, which
  is what `defineMarket` and `defineService` now take.
- **`defineMarket` and `defineService` are the escape hatch, not the front door.** Use them for a
  venue this package does not ship, or for one it does whose calendar is wrong for you. A shipped
  venue is one instance per process, so callers share its day-schedule cache rather than each
  building their own.
- **Dates outside the verified calendar throw `CALENDAR_HORIZON`.** They used to be answered from
  weekends and session times alone, so a pinned install would have reported the exchange open on
  Christmas Day 2029 in silence. Getting bank holidays right is the reason to depend on this
  package, so it refuses rather than inventing them. The error's `details.side` is `'before'` or
  `'after'`, because upgrading only extends `through` — a backfill below `from` needs its own
  calendar, not a newer release.
- `DaySchedule.open`/`.close` are now **`dayStart`/`dayEnd`**. An exchange opens in stages, so the
  first session is the opening auction; code treating `open` as the start of trading would act ten
  minutes early and look correct.
- `Status` no longer carries `nextTransition`. Resolving it eagerly made `isOpen` throw for dates
  `covers()` reported as fine — 3,325 minutes of them for XLON. Ask `nextTransition()` when you
  want the future; it is the one call that can legitimately reach past the horizon.
- `listMarkets()`, `listServices()` and `UNKNOWN_VENUE` are gone with the registry;
  `CALENDAR_HORIZON` is new.
- Query methods take an instant and nothing else. `isOpen` is continuous trading, `inSession`
  includes the auctions; that covered every real use, so the phase-set option went.

### Added

- `DaySchedule.dayStart` and `DaySchedule.dayEnd` — the day's first opening and final closing
  instants. Previously the only way to ask "when does this venue actually close today" was to reach
  into `sessions` and take the last element, which two independent consumers both ended up doing.
- `venue.covers(date)` — whether the calendar covers a date, without catching an exception. Check it
  at deploy time or in CI: a serverless process has no startup that knows the time, and the only
  clock there is the one this package exists to stop you reading.
- `scripts/measure-performance.mjs`, which produces the README's performance table.

### Fixed

- `VenueData` is discriminated by type, so `defineMarket(RNS_CALENDAR)` is a compile error as well
  as a runtime one.
- Bank holidays moved from each venue to `data/jurisdictions/`, so venues sharing a jurisdiction
  cannot drift apart and the dates are stored once. Generated calendar output is compact rather than
  pretty-printed: 29 KB to 10 KB across both venues.

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
