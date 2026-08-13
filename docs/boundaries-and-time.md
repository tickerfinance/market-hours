# Boundaries and time

The reasoning behind the two decisions everything else follows from.

## Half-open intervals

A session runs from `start` inclusive to `end` exclusive, compared on epoch milliseconds.

> 16:29:59.999 is `open`. 16:30:00.000 is `closing-auction`.

**Every instant belongs to exactly one phase.** Inclusive at both ends double-counts the boundary
millisecond, so 16:30:00.000 would be both `open` and `closing-auction`. Exclusive at both ends
orphans it, so it would be neither.

**The dead-minute bug.** Exclusive-at-both-ends is not a theoretical concern. A common
implementation compares "now" against a session start built by setting hours and minutes on the
current time — which leaves the seconds and milliseconds untouched. At 08:00:30 the computed start
is _also_ 08:00:30, and an exclusive comparison excludes it. The result is a market that reports
closed for the first minute of every session, every day, and it is invisible in any test that uses
a whole minute.

**Sessions tile the day.** `open` ends at exactly the millisecond `closing-auction` begins, so
`nextTransition` has one unambiguous answer and durations sum exactly.

**It matches everything else worth matching** — Temporal, ICU, and every interval library that has
thought about this.

## Never read the host clock

The idiom this package exists to replace:

```ts
const london = new Date(
  now.toLocaleString('en-US', { timeZone: 'Europe/London' }),
);
london.getHours(); // hopeful
```

Two separate faults:

1. `toLocaleString` produces a locale-formatted string like `1/15/2026, 10:30:00 AM`, and parsing
   that with `new Date()` is implementation-defined. V8 tolerates it; other engines return
   `Invalid Date`.
2. When it does parse, the result is a `Date` in the **host's** time zone carrying London's
   wall-clock digits. `getHours()` then answers in host-local time. It is correct only when the
   host is running in UTC during GMT — a UTC server in winter — and an hour out otherwise.

The correct primitive is `Intl.DateTimeFormat.prototype.formatToParts`, which returns the
components directly with no string round-trip.

### How this is enforced

- In `src/`, the only permitted `Date` operations are `new Date(number)`, `.getTime()`,
  `Date.UTC()` and `.toISOString()`.
- `src/no-host-local-apis.test.ts` replaces every host-local `Date` method with one that throws,
  then runs the entire public API.
- `test/host-timezone.test.ts` asserts golden answers, and `scripts/run-tz-matrix.mjs` runs the
  whole suite under eight host zones — including a half-hour offset, a 45-minute offset, a
  30-minute DST step, and a zone 14 hours ahead of UTC.
- `test/differential.test.ts` compares against an independent oracle built on `format` in a
  different locale, over hundreds of thousands of instants.

## Reading parts by type, not position

```ts
parts.find((part) => part.type === 'hour'); // correct
parts[4]; // works until it doesn't
```

The order of `formatToParts` output is locale- and ICU-version-dependent. Indexing into it is a bug
that only appears on someone else's runtime, months later.

## Ambiguous and nonexistent local times

Twice a year a local time either happens twice or not at all.

- **Clocks go back**: 01:00–01:59 happens twice. Two instants share one wall clock.
- **Clocks go forward**: 01:00–01:59 never happens. No instant has that wall clock.

`fromZonedParts` finds the offset by probing a day either side of the requested time, generating a
candidate from each, and keeping the ones that round-trip. One survivor is the normal case, two
means ambiguous, none means nonexistent.

`disambiguation` decides what to do:

| Value                  | Repeated hour                 | Skipped hour                    |
| ---------------------- | ----------------------------- | ------------------------------- |
| `compatible` (default) | The earlier instant           | Shift forward by the gap        |
| `earlier`              | The earlier instant           | Shift back by the gap           |
| `later`                | The later instant             | Shift forward by the gap        |
| `reject`               | Throws `AMBIGUOUS_LOCAL_TIME` | Throws `NONEXISTENT_LOCAL_TIME` |

`compatible` matches Temporal, so it is the least surprising default.

No XLON session boundary can land in the London gap — the market is shut at 01:00 on a Sunday — so
schedule computation is never ambiguous in practice. The machinery exists because `fromZonedParts`
is public, and because a future venue's sessions might straddle a transition.

## Delegate DST entirely

There is no GMT/BST rule anywhere in this package. The IANA database is the authority, reached
through `Intl`.

This is not pedantry. Between 1968 and 1971 the UK did not put its clocks back at all — British
Standard Time, UTC+1 all year. A hand-rolled "last Sunday in March" rule gets that wrong, and there
is a test asserting the correct behaviour precisely because it is the kind of thing a clever rule
would break on.
