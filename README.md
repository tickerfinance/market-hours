# market-hours

**Is the market open?** Trading hours, bank holidays and half days as pure functions.
Zero runtime dependencies — `Intl` and arithmetic, nothing else.

```ts
import { defineMarket } from 'market-hours';
import { XLON } from 'market-hours/xlon';

const lse = defineMarket(XLON);

lse.isOpen(); // now
lse.isOpen('2026-12-24T14:00:00Z'); // false — Christmas Eve is a half day
lse.getStatus().phase; // 'pre-open-auction' | 'open' | 'closing-auction' | 'closed'
lse.nextOpen(); // Date
```

## Why

**Every function takes an optional instant.** No mocking, no fake timers, no injected clock.
`lse.isOpen('2026-12-24T14:00:00Z')` is a one-line assertion. Libraries that read `new Date()`
internally are the reason market-hours code is usually untested.

**It is correct on any machine.** The common shortcut —

```ts
new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' })); // don't
```

— parses a locale-formatted string in the _host's_ time zone. It is right only on a UTC server
during GMT, and quietly an hour out the rest of the year. The whole test suite here runs under
eight host time zones, including a 45-minute offset and one on the far side of the date line, and a
test traps every host-local `Date` method while the entire public API executes.

**It ships a real calendar.** Weekends, bank holidays, and the 12:30 Christmas Eve and New Year's
Eve closes that almost nothing models. As plain JSON, refreshed monthly, no network call at
runtime — so it works in a Worker or a Lambda on the request path.

**It refuses rather than guesses.** Past the end of the verified calendar, or on a runtime whose
time-zone data cannot be trusted, it throws instead of returning a plausible answer.

## Install

```sh
npm install market-hours
```

No dependencies. Ships ESM and CommonJS with types for both.

```ts
import { defineMarket } from 'market-hours'; // ESM
const { defineMarket } = require('market-hours'); // CommonJS
```

## Calendars are imported, not looked up

There is no `getMarket('XLON')`. Each calendar is its own module, imported by name:

```ts
import { XLON } from 'market-hours/xlon';
import { RNS } from 'market-hours/rns';
```

A string-keyed registry would have to reference every calendar it could name, so asking about one
exchange would bundle all of them. Importing by name means **a bundler keeps exactly what you
used** — see [Bundle size](#bundle-size).

## Sessions are half-open: `[start, end)`

The start of a session is included and the end is excluded, compared on epoch milliseconds.

> On an ordinary London day, **16:29:59.999 is `open`** and **16:30:00.000 is `closing-auction`**.

This is the one convention worth reading before the API. It means every instant belongs to exactly
one phase, adjacent sessions tile the day, and there is no boundary at which the venue is in two
phases or in none. The alternative — exclusive at both ends — leaves the first minute of every
session belonging to nothing, so the market reads closed from 08:00:00 to 08:00:59.

If you poll on a fixed interval, note the consequence: a tick landing exactly on a session's `end`
is outside it.

## Instants and dates are different things

Anywhere a **time** is accepted you may pass a `Date`, epoch milliseconds, or an ISO 8601 string.

> **An instant string with no offset is read as UTC.** `'2026-12-24T09:00'` means 09:00 UTC.

Anywhere a **date** is accepted — `getSchedule`, `isTradingDay`, `covers` — a `'YYYY-MM-DD'` string
means that civil date **in the venue's own time zone**.

Those two rules collide on one shape of input, so they are worth reading together:

```ts
lse.isTradingDay('2026-06-10'); // civil date in London  → true
lse.isOpen('2026-06-10'); // instant, midnight UTC  → false
```

Both are correct and neither is a typo. If you mean a date, use a date-taking function. Anything
unparseable throws rather than silently becoming `Invalid Date`.

## Venues

Two kinds, because they answer different questions and have different phases.

|                  | Constructor       | Identifier    | Phases                                                  |
| ---------------- | ----------------- | ------------- | ------------------------------------------------------- |
| **Exchange**     | `defineMarket()`  | ISO 10383 MIC | `closed`, `pre-open-auction`, `open`, `closing-auction` |
| **News service** | `defineService()` | Service code  | `closed`, `open`                                        |

Shipped today: **`market-hours/xlon`** (London Stock Exchange) and **`market-hours/rns`**
(Regulatory News Service). They share the England and Wales bank holiday calendar, and both close
early on 24 and 31 December.

```ts
import { defineMarket, defineService } from 'market-hours';
import { XLON } from 'market-hours/xlon';
import { RNS } from 'market-hours/rns';

const lse = defineMarket(XLON);
const rns = defineService(RNS);

// The newswire is still running after the order book has shut.
lse.isOpen('2026-01-15T18:00:00Z'); // false
rns.isOpen('2026-01-15T18:00:00Z'); // true
```

Hold the result at module scope. It is immutable and caches its own day schedules.

## API

### `defineMarket(data, options?)` and `defineService(data, options?)`

Build a venue from calendar data — either one this package ships, or your own.

`options.strict` defaults to `true`; see [Calendar coverage](#calendar-coverage).

### `venue.isOpen(at?, options?) → boolean`

Continuous trading only. The closing auction is **not** open.

```ts
lse.isOpen('2026-01-15T16:32:00Z'); // false — in the closing auction
lse.isOpen('2026-01-15T16:32:00Z', { include: ['open', 'closing-auction'] }); // true
```

`include` is narrowed to the venue's own phases, so asking a news service about an auction is a
type error rather than a permanent `false`.

### `venue.inSession(at?, options?) → boolean`

True during any live phase, auctions included. "Is anything happening?"

### `venue.isTradingDay(date?) → boolean`

Whether the venue trades at all that day.

### `venue.getStatus(at?, options?) → Status`

```ts
{
  venueId: 'XLON',
  at: Date,                 // the instant evaluated
  localDate: '2026-12-24',  // civil date in the venue's zone
  localTime: '12:29:59.999',
  phase: 'open',
  isOpen: true,
  inSession: true,
  holiday: null,            // the holiday's name when closed for one
  currentSession: { phase: 'open', start: Date, end: Date } | null,
  nextTransition: { at: Date, from: 'open', to: 'closing-auction' },
  beyondCoverage: false,
}
```

### `venue.getSchedule(date?) → DaySchedule`

The day's sessions, plus `open` and `close` — the first opening and final closing instants, or
`null` on a non-trading day.

```ts
lse.getSchedule('2026-12-24').close; // 2026-12-24T12:35:00.000Z
```

Use `close` rather than reaching into `sessions`. It is also how you detect a short day without
hardcoding a clock time: compare it to an ordinary day's, or just use it.

### `venue.nextTransition(at?) → Transition`

The next instant the phase changes, with the phases either side. Always strictly in the future.

### `venue.nextOpen(at?, options?) → Date` and `venue.nextClose(at?, options?) → Date`

The next instant the venue enters or leaves an included phase, skipping weekends and holidays.

```ts
// Friday after the close; the following Monday is a bank holiday.
lse.nextOpen('2026-05-01T17:00:00Z'); // 2026-05-05T07:00:00.000Z
```

### `venue.covers(date) → boolean` and `venue.getCoverage() → Coverage`

Whether the calendar actually covers a date, and the verified range plus its sources.

### Time-zone primitives

Exported deliberately. People reach for the broken idiom because they need a wall clock; here is a
correct one.

```ts
import {
  toZonedParts,
  fromZonedParts,
  getTimeZoneOffsetMs,
} from 'market-hours';

toZonedParts('2026-07-15T10:30:00Z', 'Europe/London'); // { hour: 11, minute: 30, offsetMs: 3600000, ... }
fromZonedParts(
  { year: 2026, month: 7, day: 15, hour: 11, minute: 30 },
  'Europe/London',
);
getTimeZoneOffsetMs('Europe/London', '2026-07-15T10:30:00Z'); // 3600000
```

`fromZonedParts` takes a `disambiguation` option — `'compatible'` (the default, matching Temporal),
`'earlier'`, `'later'` or `'reject'` — for the hour that repeats when clocks go back and the hour
that is skipped when they go forward.

### Errors

Every error is a `MarketHoursError` with a stable `code`. Match on the code, not the message.

```ts
import { isMarketHoursError } from 'market-hours';

try {
  lse.isOpen('2099-12-25T12:00:00Z');
} catch (error) {
  if (isMarketHoursError(error)) error.code; // 'CALENDAR_HORIZON'
}
```

Codes: `CALENDAR_HORIZON`, `INVALID_INSTANT`, `INVALID_DATE`, `INVALID_TIME_ZONE`,
`TIME_ZONE_UNAVAILABLE`, `AMBIGUOUS_LOCAL_TIME`, `NONEXISTENT_LOCAL_TIME`, `NO_TRANSITION_FOUND`,
`INVALID_VENUE_DEFINITION`.

Use `isMarketHoursError` rather than `instanceof`: a bundle can contain both the ESM and CommonJS
copies of the class, and `instanceof` fails across that boundary.

## Calendar coverage

Holidays are verified from **2019-01-01 through 2028-12-31**. `getCoverage()` reports the current
range at runtime.

**Past that date, this package throws `CALENDAR_HORIZON` by default.**

That is deliberate, and it is the same rule applied when the runtime's time-zone data cannot be
trusted: a package whose only job is to know whether the market is open should not guess. A pinned
dependency would otherwise keep reporting the exchange open on Christmas Day, silently, for years —
and unlike most staleness, you can calculate the exact date it starts today.

Three ways to deal with it, in order of preference:

**Upgrade.** A release each month extends the horizon.

**Supply your own calendar.** The data ships as plain JSON and `defineMarket` takes any of it, so
you are never blocked on us:

```ts
import { XLON } from 'market-hours/xlon';

const lse = defineMarket({
  ...XLON,
  coverage: { from: XLON.coverage.from, through: '2030-12-31' },
  holidays: [...XLON.holidays, { date: '2029-12-25', name: 'Christmas Day' }],
});
```

**Turn strict off.** Answers then come from weekends and session times alone, `beyondCoverage` is
`true` on the result, and it warns once:

```ts
const lse = defineMarket(XLON, { strict: false });
lse.getStatus('2035-06-13T12:00:00Z').beyondCoverage; // true
```

Use that where a wrong answer beats an exception — rendering a page, say — and check
`beyondCoverage` where it matters.

## Bundle size

Calendars are separate modules, so a bundler drops the ones you never import. Measured with
esbuild, minified:

| Imported   | Bundle  | Gzipped |
| ---------- | ------- | ------- |
| XLON       | 20.1 KB | 6.2 KB  |
| XLON + RNS | 21.4 KB | 6.3 KB  |

Adding a second venue costs 1.3 KB because bank holidays are shared per jurisdiction rather than
copied per venue. Adding a tenth costs you nothing at all if you never import it.

## Performance

Roughly **10 µs per call**, and the first call to a venue costs about 10 ms while `Intl` builds its
formatter.

Day schedules are cached, but resolving an instant to a civil date goes through
`Intl.formatToParts` first, so the cache does not remove that cost. Irrelevant for a handful of
calls per request or per cron tick; worth knowing if you are sweeping a long series of instants.

## What this does not model

- **Intraday halts and suspensions.** These are live events, not calendar data.
- **Auction extensions.** A price-monitoring extension adds five minutes to an auction call and can
  repeat, so an individual security's closing auction may run past 16:35 and as late as 16:45.
  There is also a random uncrossing period of up to 30 seconds. Extension behaviour is a
  per-instrument parameter, so no venue-level clock time is correct for every security. The
  calendar models the **scheduled** call, 16:30–16:35. If you need to cover the tail, pad from
  `getSchedule().close` — that contracts automatically on half days, which a hardcoded 16:45 does
  not.
- **Ad-hoc same-day closures.**
- **Settlement and clearing calendars.**

## Compatibility

| Target                       | Status                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 20 · 22 · 24            | Full suite in CI, under 8 host time zones                                                                                                    |
| Node 18                      | The published tarball is installed and exercised, ESM and CommonJS                                                                           |
| Cloudflare Workers (workerd) | Full unit suite runs in workerd                                                                                                              |
| Bun · Deno                   | The published package is installed and used each release                                                                                     |
| Chromium · Firefox · WebKit  | Core suite runs in-browser                                                                                                                   |
| AWS Lambda                   | Supported — it is Node. Not separately tested                                                                                                |
| React Native / Hermes        | Supported **only where the engine provides `Intl` with IANA time-zone data**. Not tested on a device. Call `getTimeZoneSupport()` at startup |
| TypeScript 4.8 → 7           | Four consumer `tsconfig` shapes, each on the versions where its configuration is legal                                                       |
| Bundlers                     | `publint` and `@arethetypeswrong/cli` clean for node10, node16-cjs, node16-esm and bundler                                                   |

### Runtimes without time-zone data

Some builds — notably older React Native — ship `Intl` without IANA time-zone data, and some
silently format in UTC while accepting a zone name, which would make every answer an hour wrong for
seven months of the year without raising anything.

This package runs a known-answer probe rather than trusting `typeof Intl`, and **throws
`TIME_ZONE_UNAVAILABLE` rather than returning a wrong answer**.

```ts
import { getTimeZoneSupport } from 'market-hours';

const support = getTimeZoneSupport('Europe/London');
if (!support.supported) {
  // reason: 'no-intl' | 'no-time-zone-support' | 'incorrect-offsets'
  console.warn(support.detail);
}
```

## Provenance

All calendar data lives in [`data/`](data) as plain JSON and is shipped in the published package,
so it can be read and checked without running any of this code — or from another language.

```
data/
  jurisdictions/   england-and-wales.json   bank holidays, shared
  exchanges/       XLON.json                sessions, early closes
  news-services/   RNS.json
```

**Bank holidays** come from [`gov.uk/bank-holidays.json`](https://www.gov.uk/bank-holidays.json),
`england-and-wales` division. That is public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
They sit under the jurisdiction rather than each venue, because that is what they are — a fact
about England and Wales, not about a particular exchange.

**XLON session times** are transcribed from the London Stock Exchange's published trading-day
timetable. The closing auction call is the scheduled 16:30–16:35; see
[what this does not model](#what-this-does-not-model).

**XLON early closes** — 24 and 31 December, 12:30 — are entered by hand and confirmed against the
exchange's published calendar. The gov.uk feed does not publish them.

**RNS hours are observed, not official.** No public source states the service's opening hours as a
clock window: LSEG documents support hours, and "RIS opening hours" is a regulatory concept in
FCA Listing Rule 1.3.4R without published times. The 07:00–19:30 window here is derived from the
release timestamps of published RNS announcements over 2019–2026, excluding the service's own daily
`Service Notice` items. The 13:30 half-day close is derived the same way. Treat these as a
well-evidenced envelope rather than a published timetable, and
[open an issue](https://github.com/tickerfinance/market-hours/issues) if you have a better source.

Every source is also available at runtime via `getCoverage().sources`, so attribution travels with
the data.

## Adding a venue

```ts
import { defineMarket } from 'market-hours';

const xnys = defineMarket({
  id: 'XNYS',
  type: 'exchange',
  name: 'New York Stock Exchange',
  timeZone: 'America/New_York',
  weekend: [0, 6],
  sessions: [{ phase: 'open', start: '09:30', end: '16:00' }],
  coverage: { from: '2026-01-01', through: '2026-12-31' },
  sources: [{ what: 'Holidays', url: '…', licence: '…', retrievedAt: '…' }],
  holidays: [{ date: '2026-07-03', name: 'Independence Day (observed)' }],
  earlyCloses: [
    {
      date: '2026-11-27',
      sessions: [{ phase: 'open', start: '09:30', end: '13:00' }],
    },
  ],
});
```

To contribute a venue so everyone gets it, add a `data/` file — see
[docs/adding-a-venue.md](docs/adding-a-venue.md).

## Versioning

- **major** — an export removed or renamed, a signature changed, the boundary convention changed, a
  default changed.
- **minor** — new exports, new venues, **any change to calendar contents including extending
  coverage**, a new value in a phase union.
- **patch** — fixes that change no calendar answer, docs, types, performance.

**Calendar data is a minor, not a patch.** It changes observable behaviour for some inputs, so
`patch` would silently alter answers for anyone on `~x.y.z`. Expect minor releases roughly monthly.

While `0.x`, a minor release may break.

## Found a wrong date?

Please [open an issue](https://github.com/tickerfinance/market-hours/issues) with the venue, the
date, what you expected, and a public source. Calendar corrections are the most valuable
contribution to this package.

## Licence

[MIT](LICENSE) © IR Data Services Ltd. Bank holiday data is licensed under the Open Government
Licence v3.0 and attributed above.
