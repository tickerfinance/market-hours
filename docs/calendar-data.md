# Calendar data

## Where it lives

`data/<namespace>/<ID>.json`, one file per venue, every date explicit:

```
data/
  exchanges/       XLON.json     ids are ISO 10383 MICs
  news-services/   RNS.json      ids are ordinary acronyms
```

**The namespace is not cosmetic.** Exchange ids come from ISO 10383, an external registry that
issues new codes without our involvement; news service ids are just acronyms. Nothing prevents a
MIC issued in future from matching a service code already shipped here. In one flat directory the
two would collide on the filename, on the generated module, and in the registry — where a lookup
keyed on the id alone would return whichever was loaded first and report the other as the wrong
type. So the type is part of the path and part of the lookup key, and
`getMarket('XYZW')` and `getService('XYZW')` can both be correct at once. The files are shipped in the published
package, so a consumer — or a program in another language — can read the same dates straight out of
`node_modules` without running any of this code.

`src/calendars/**/*.generated.ts` inlines each JSON file as a typed literal. That step exists only
because importing JSON is not portable: ESM needs import attributes, CommonJS and every bundler
disagree, and a published package cannot depend on any of them. Nothing is transformed — which is
what makes `npm run check:generated` a meaningful proof rather than a formality.

## Why data and not rules

England and Wales bank holidays look rule-shaped: fixed dates with weekend substitution, the first
Monday in May, Easter-relative days. It is tempting to write the rules.

Don't.

- Rules cannot express a state funeral, a jubilee, or a coronation. All three occur in the last six
  years of this calendar.
- Rules are wrong silently, in the years nobody tested.
- A reviewer can check a flat list of dates against a published calendar in about a minute. Nobody
  can eyeball a computus implementation.
- Early closes are not published in any machine-readable feed at all, so part of the calendar has
  to be hand-entered regardless.

The cost is that coverage is finite and has to be refreshed. That is a visible, managed cost rather
than a hidden one.

## Coverage and the horizon

```jsonc
"coverage": { "from": "2019-01-01", "through": "2028-12-31" }
```

`through` is the last date whose holidays have actually been verified. Past it, weekends and
session times still apply but holidays are unknown, and every result carries
`beyondCoverage: true`.

`isOpen` still answers rather than throwing. A stale dependency should degrade, not take production
down on an ordinary Tuesday — and the failure mode is narrow: a wrong answer only on an
unrecognised holiday. Check `beyondCoverage`, or assert on `getCoverage()` at boot, if that
trade-off is wrong for you.

`.github/workflows/calendar-freshness.yml` fails weekly once coverage drops below six months ahead,
and `publish.yml` refuses to publish a release whose calendar is already that stale.

## The monthly refresh

`.github/workflows/calendar-refresh.yml` runs on the 5th of each month — not the 1st, so the
upstream publisher has time to settle after a change.

1. `scripts/refresh-holidays.mjs` fetches
   [`gov.uk/bank-holidays.json`](https://www.gov.uk/bank-holidays.json) and takes the
   `england-and-wales` division.
2. It **merges** rather than replaces. The feed is a rolling window — currently 2019 to 2028 — that
   drops old years as it advances. A naive overwrite would silently delete verified history.
3. A date disappearing from _inside_ the feed's own window is a genuine upstream correction, so the
   job fails rather than accepting it. Re-run with `--allow-removals` once a human has looked.
4. It proposes early closes for dates that would otherwise be trading days, and marks them in the
   pull request as proposals requiring confirmation.
5. `npm run build:calendars` regenerates, `npm test` runs against the new data, and the job opens a
   pull request.

It opens a pull request rather than committing directly. A stale calendar makes the library quietly
wrong; a _wrong_ calendar makes it confidently wrong. Data deserves the same review as code, and
the pull request is also where the early-close confirmation gets recorded.

`scripts/refresh-holidays.mjs` is the only script here that touches the network. Nothing at runtime
fetches anything.

## Early closes are hand-entered

No public feed publishes them. Each is entered by hand and confirmed against the venue's published
calendar. The refresh job proposes candidates and the reviewer confirms.

For XLON and RNS, the proposal rule is 24 and 31 December when they would otherwise be trading
days. Over the current coverage window that yields 14 dates: 2022, 2023 and 2028 are excluded
because those dates fall at a weekend.

## Verifying it yourself

```sh
npm run check:generated   # the shipped calendar is exactly what data/ says
npm test                  # every holiday and early close is asserted
node scripts/refresh-holidays.mjs --dry-run   # diff against the live feed, writes nothing
```

`test/invariants.test.ts` asserts the structural properties independently of any particular date:
holidays sorted, unique and inside coverage; no holiday at a weekend (England and Wales substitute
a weekday, so a Saturday entry means something broke); sessions sorted, non-overlapping and
half-open; early closes shorter than a normal day; and venues sharing a time zone sharing a holiday
list.

## Attribution

Bank holiday data is public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Every venue file carries its sources, and they are available at runtime through
`getCoverage().sources` so attribution travels with the data.
