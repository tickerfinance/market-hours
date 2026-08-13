# Contributing

## Reporting a wrong date

The most valuable contribution to this package is telling us a date is wrong.
[Open a calendar correction](https://github.com/tickerfinance/market-hours/issues/new?template=calendar_correction.yml)
with the venue, the date, what actually happened, and a public source. A source is required —
without one there is no way to tell a correction from a guess.

## Getting set up

```sh
npm ci
npm test
```

| Command                   | What it does                                          |
| ------------------------- | ----------------------------------------------------- |
| `npm test`                | The unit and integration suite                        |
| `npm run test:tz`         | The whole suite under eight host time zones           |
| `npm run test:workers`    | The unit suite inside workerd                         |
| `npm run test:browser`    | The unit suite in Chromium, Firefox and WebKit        |
| `npm run typecheck`       | `tsc --noEmit` over source, tests and scripts         |
| `npm run check:generated` | Proves `src/calendars/*.generated.ts` matches `data/` |
| `npm run verify`          | Everything CI runs, in one command                    |

## The rules that matter

**Never read the host clock or the host time zone.** In `src/`, the only permitted `Date`
operations are `new Date(number)`, `.getTime()`, `Date.UTC()` and `.toISOString()`. Anything that
answers in local time — `getHours`, `getDay`, `toLocaleString`, `getTimezoneOffset` — is forbidden,
and `src/no-host-local-apis.test.ts` makes those methods throw while the entire public API runs. If
you need a wall clock, use `toZonedParts`.

**Every function takes an optional instant.** Nothing in `src/` may read `Date.now()` except the
one place that normalises a missing argument. This is what makes the package testable without fake
timers, and it is not negotiable.

**Sessions are half-open, `[start, end)`.** Comparisons are on epoch milliseconds. Do not introduce
a second convention.

**Zero runtime dependencies.** No Node built-ins, no `process`, no `Buffer`, no filesystem. The
workerd job enforces this: if it cannot import, the pull request fails.

**Calendar data is data.** `data/*.json` holds every date explicitly. No rules are evaluated at
runtime and no dates are derived. If you edit `data/`, run `npm run build:calendars` and commit the
regenerated files.

## Adding a venue

See [docs/adding-a-venue.md](docs/adding-a-venue.md). In short: add `data/<ID>.json`, cite your
sources in it, regenerate, and add a test that asserts the boundaries at millisecond precision.

## Style

Prettier with single quotes, 80 columns, and `.editorconfig`. Run `npm run format`.

Comments should say _why_, not _what_. A comment explaining that a line adds five minutes is noise;
a comment explaining that the auction can be extended three times is the reason the code exists.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). `feat:`, `fix:`, `docs:`, `chore:`,
`test:`, `refactor:`, `build:`, `ci:`. Calendar refreshes use `chore(calendar):`.

## Releases

See the [versioning policy](README.md#versioning). Calendar data changes are a **minor**, never a
patch, because they change observable behaviour for some inputs.
