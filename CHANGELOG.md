# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/). Note that **calendar data changes are a minor
release, never a patch** — they change observable behaviour for some inputs.

## [0.1.0] — 2026-08-14

First release.

### Venues

- **XLON** (London Stock Exchange) via `market-hours/xlon`: opening auction 07:50–08:00, continuous
  trading 08:00–16:30, closing auction 16:30–16:35. England and Wales bank holidays, and the 12:30
  early closes on 24 and 31 December.
- **RNS** (Regulatory News Service) via `market-hours/rns`: 07:00–19:30 on weekdays, the same
  holidays, and a 13:30 early close on 24 and 31 December.

Both verified from 2019-01-01 through 2028-12-31. Sessions and holidays ship as plain JSON under
`data/`, readable without running any of this code.

### API

- Venues are imported by name and arrive ready to query — `import { XLON } from 'market-hours/xlon'`
  — so a bundler drops the ones you never import. There is no registry.
- `isOpen` (continuous trading only), `inSession` (auctions included), `isTradingDay`, `getStatus`,
  `getSchedule`, `nextTransition`, `nextOpen`, `nextClose`, `covers` and `getCoverage`. Every one
  takes an optional instant, so asserting on a bank holiday needs no fake timers.
- `DaySchedule.dayStart` and `dayEnd` — the day's first opening and final closing instants, which
  contract by themselves on a short day.
- `defineMarket` and `defineService` for venues this package does not ship, and for changing ones it
  does. Each venue module exports its calendar alongside it, as `XLON_CALENDAR` / `RNS_CALENDAR`.
- Time-zone primitives: `toZonedParts`, `fromZonedParts`, `getTimeZoneOffsetMs` and
  `getTimeZoneSupport`.
- Typed errors with stable codes, and `isMarketHoursError` for checks that survive the ESM and
  CommonJS boundary.
- Zero runtime dependencies. Dual ESM and CommonJS, with types for both.

### Behaviour worth knowing

- Sessions are half-open, `[start, end)`, compared on epoch milliseconds. 16:29:59.999 is `open`;
  16:30:00.000 is `closing-auction`.
- An ISO string with no offset is read as **UTC**, never as host-local time. A `'YYYY-MM-DD'` string
  passed where a date is accepted is that civil date in the venue's own time zone.
- Dates outside the verified calendar throw `CALENDAR_HORIZON` rather than guessing at holidays.
  `error.details.side` says which end you crossed, because upgrading only ever extends the upper
  one.
- Runtimes without usable IANA time-zone data get a thrown `TIME_ZONE_UNAVAILABLE` rather than a
  plausible wrong answer. Probe with `getTimeZoneSupport()`.

[0.1.0]: https://github.com/tickerfinance/market-hours/releases/tag/v0.1.0
