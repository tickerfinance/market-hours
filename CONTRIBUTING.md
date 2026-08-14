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
| `npm run test:tz`         | The whole suite under eight host time zones              |
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

**Never add a registry.** Calendars are imported by name — `market-hours/xlon` — precisely so a
bundler can drop the ones a consumer never uses. Anything in the entry point that references a
calendar, directly or through a lookup table, makes every consumer pay for every venue. There is a
test asserting the entry point exports only functions.

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
