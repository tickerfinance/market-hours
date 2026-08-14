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

| Command                   | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `npm test`                | The unit and integration suite                           |
| `npm run test:tz`         | The whole suite under eight host time zones (see below)  |
| `npm run test:workers`    | The unit suite inside workerd                            |
| `npm run test:browser`    | The unit suite in Chromium, Firefox and WebKit           |
| `npm run typecheck`       | `tsc --noEmit` over source, tests and scripts            |
| `npm run check:generated` | Proves `src/calendars/**/*.generated.ts` matches `data/` |
| `npm run verify`          | Everything CI runs, in one command                       |

## Where tests live

| Location            | Holds                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/**/*.test.ts`  | Unit tests, beside the unit they test                                                                          |
| `test/**/*.test.ts` | Suite-level tests that span modules — differential, invariants, host time zone, packaging                      |
| `test/consumer/*`   | Tests that run against the **built or installed** package rather than the source tree, outside the test runner |
| `scripts/*`         | Maintenance tasks. Not tests                                                                                   |

`test/consumer/` exists because those checks cannot run inside vitest: two of them install the
packed tarball into a clean project and import it as a real consumer would, and the third needs a
separate process per scenario so it can substitute a broken `Intl` before the package loads. They
are plain `.mjs`/`.cjs` for the same reason, and CI runs them directly.

The `src` / `test` split is about **scope**, and nothing else keys off it.

In particular, the workerd and browser runs do **not** skip `test/`. They exclude by capability:
only `packlist.test.ts` and `fixtures.test.ts` are skipped, because those two shell out to npm and
read the repository. Everything else runs everywhere, which matters most for
`differential.test.ts` — a different ICU build is exactly where a time-zone implementation
diverges, so that suite is worth more in workerd and in three browser engines than it is on your
machine.

So: **do not add a Node built-in, `process` or filesystem access to a spec without adding it to
the exclusion lists** in `vitest.workers.config.ts` and `vitest.browser.config.ts`. Prefer guarding
the access so the spec stays portable — `host-timezone.test.ts` shows the pattern.

When editing either exclusion list, spread `configDefaults.exclude` rather than replacing it.
Replacing it drops `**/node_modules/**`, and the run will happily collect every test in every
dependency.

## The host time-zone matrix

`npm run test:tz` runs the whole suite once per zone. Each one is there to break a specific
assumption, so do not trim the list without knowing which:

| Zone                  | Breaks                                                 |
| --------------------- | ------------------------------------------------------ |
| `UTC`                 | The happy path — and the only one most CI ever tests   |
| `Europe/London`       | Host zone equal to venue zone, which hides offset bugs |
| `America/New_York`    | Negative whole-hour offset                             |
| `America/St_Johns`    | Negative half-hour offset, −03:30                      |
| `Asia/Kolkata`        | Positive half-hour offset, +05:30, no DST              |
| `Pacific/Chatham`     | 45-minute offset, +12:45 / +13:45                      |
| `Australia/Lord_Howe` | DST step of 30 minutes rather than an hour             |
| `Pacific/Kiritimati`  | +14, always a day ahead of UTC                         |

The date-line zone catches "the civil date is a day out". The 45-minute and 30-minute-DST zones
catch offset arithmetic that assumes whole hours.

Node 18 is the floor in `engines`, but vitest 4 needs Node 20, so the suite cannot run there. The
`consume` job installs the packed tarball on Node 18 instead and exercises both `import` and
`require` — which is what a Node 18 consumer actually does. Claiming the full suite ran there would
have been untrue.

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

**Calendar data is data.** `data/` holds every date explicitly. No rules are evaluated at runtime
and no dates are derived. If you edit `data/`, run `npm run build:calendars` and commit the
regenerated files.

**Never add a registry.** Venues are imported by name — `market-hours/xlon` — precisely so a
bundler can drop the ones a consumer never uses. Anything in the entry point that references a
calendar, directly or through a lookup table, makes every consumer pay for every venue. There is a
test asserting the entry point exports only functions.

**A shipped venue arrives built.** `market-hours/xlon` exports `XLON`, not just `XLON_CALENDAR`;
`defineMarket` is for venues we do not ship and for changing ones we do. If using the package
starts to need a construction step again, that is a regression in the API, not a detail. Building
the venue at module scope must also stay free of `Intl` — a broken-runtime consumer test depends
on the probe still being lazy.

## Adding a venue

You do not need to change this package to use a venue it does not ship — pass your own calendar to
`defineMarket`. These steps are for contributing one so everyone gets it.

1. **Add `data/exchanges/<MIC>.json` or `data/news-services/<CODE>.json`.** The id must match the
   filename and the `type` must match the directory; the generator enforces both. Name a
   `jurisdiction` rather than listing bank holidays, adding `data/jurisdictions/<name>.json` if
   yours does not exist yet.

   Ids are unique within a namespace, never across them. Exchange ids are ISO 10383 MICs from a
   registry that keeps issuing codes, so a future MIC may well match a news service acronym already
   here. That is expected and handled.

2. **Fill in every field.** There are no defaults and nothing is inferred: `timeZone` is an IANA
   name and never a fixed offset, `weekend` is weekday numbers with `0` = Sunday, `sessions` are
   sorted, non-overlapping local `HH:mm`, `coverage.through` is the last date you have actually
   verified, and `holidays` and `earlyCloses` list every date explicitly with its source.

3. **Regenerate and test** with `npm run build:calendars && npm test`. The generator emits a module
   per venue and a resolution shim, then fails with the exact JSON to paste if `package.json` or
   `.gitignore` has not been told about the new subpath.

   Each venue module exports `<ID>`, the venue built at module scope, and `<ID>_CALENDAR`, the data
   behind it. The construction is annotated `#__PURE__` so a bundler can drop it for anyone
   importing only the data; CI checks that it still can.

4. **Add a test file.** Assert the boundaries at millisecond precision — the last millisecond inside
   a session and the first outside it — plus every holiday, every early close, and the trading days
   either side of a holiday. Copy the shape of [`src/calendars/xlon.test.ts`](src/calendars/xlon.test.ts).

5. **Wire up the refresh** if a machine-readable holiday source exists, by adding an entry to
   `VENUES` in [`scripts/refresh-holidays.mjs`](scripts/refresh-holidays.mjs). Without it, coverage
   expires and `calendar-freshness.yml` starts failing.

**Cite everything.** A date without a source cannot be checked by anyone else, and the calendar is
the whole value of this package. `through` is a promise: do not extend it past what you have
actually verified.

**Session times are local wall clock.** DST comes from the IANA database. Never write a fixed UTC
offset and never adjust a time "for summer". Early closes are a shorter day, not a special case —
there is no early-close concept in the API.

## The calendar refresh

`.github/workflows/calendar-refresh.yml` runs on the 5th of each month, not the 1st, so the upstream
publisher has time to settle after a change. Two properties of
[`scripts/refresh-holidays.mjs`](scripts/refresh-holidays.mjs) are load-bearing:

**It merges rather than replaces.** The gov.uk feed is a rolling window that drops old years as it
advances, so a naive overwrite would silently delete verified history.

**A date vanishing from inside the feed's own window fails the job** rather than being accepted as a
removal — that is a genuine upstream correction and wants a human. Re-run with `--allow-removals`
once someone has looked.

It opens a pull request rather than committing. A stale calendar makes the library quietly wrong; a
wrong one makes it confidently wrong. It is also where early-close proposals get confirmed, since no
public feed publishes those. This is the only script here that touches the network; nothing at
runtime fetches anything.

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
