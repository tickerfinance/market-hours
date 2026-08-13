# Adding a venue

Two routes. Use `defineMarket` if the calendar is yours; contribute a `data/` file if everyone
should get it.

## Your own calendar, in your own code

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
  sources: [
    {
      what: 'Holidays and early closes',
      url: 'https://www.nyse.com/markets/hours-calendars',
      licence: 'See publisher',
      retrievedAt: '2026-08-13T00:00:00Z',
    },
  ],
  holidays: [{ date: '2026-07-03', name: 'Independence Day (observed)' }],
  earlyCloses: [
    {
      date: '2026-11-27',
      sessions: [{ phase: 'open', start: '09:30', end: '13:00' }],
    },
  ],
});
```

`defineMarket` never mutates the global registry, so your calendar cannot change what
`getMarket('XLON')` returns for anyone else in the process.

## Contributing a venue

1. **Add `data/<ID>.json`.** The id is the ISO 10383 operating MIC for an exchange, or a short
   uppercase code for a news service. It must match the filename.

2. **Fill in every field.** There are no defaults and nothing is inferred:

   | Field         | Notes                                                                                                                                    |
   | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
   | `id`          | 2–12 uppercase letters or digits                                                                                                         |
   | `type`        | `exchange` or `news-service`                                                                                                             |
   | `timeZone`    | IANA name, e.g. `America/New_York`. Never a fixed offset                                                                                 |
   | `weekend`     | Weekday numbers that are never trading days, `0` = Sunday                                                                                |
   | `sessions`    | Sorted, non-overlapping, `HH:mm` local. An exchange may use `pre-open-auction`, `open` and `closing-auction`; a news service only `open` |
   | `coverage`    | `from` and `through`. `through` is the last date whose holidays you have actually verified — not a hope                                  |
   | `sources`     | Where each part of the data came from, with a URL and a retrieval date                                                                   |
   | `holidays`    | Every closed date, explicitly, with its name                                                                                             |
   | `earlyCloses` | Every short day, explicitly, with that day's full session list                                                                           |

3. **Regenerate and test.**

   ```sh
   npm run build:calendars
   npm test
   ```

4. **Add a test file.** Assert the boundaries at millisecond precision — the last millisecond
   inside a session and the first outside it — plus every holiday, every early close, and the
   trading days either side of a holiday. Copy the shape of
   [`src/calendars/xlon.test.ts`](../src/calendars/xlon.test.ts).

5. **Wire up the refresh** if a machine-readable holiday source exists. Add an entry to `VENUES` in
   [`scripts/refresh-holidays.mjs`](../scripts/refresh-holidays.mjs) so the monthly job keeps the
   venue current. Without this, coverage will expire and
   [`calendar-freshness.yml`](../.github/workflows/calendar-freshness.yml) will start failing.

## Things worth getting right

**Cite everything.** A date without a source cannot be checked by anyone else, and the calendar is
the whole value of this package.

**Do not derive dates in code.** It is tempting to compute Easter, or to write "the last Monday in
May". Rules are how calendars end up subtly wrong in the years nobody tested, and they cannot
express a state funeral or a coronation. Explicit dates can be read and verified by a human in
about a minute.

**`through` is a promise.** Everything after it is reported with `beyondCoverage: true`. Do not
extend it past what you have actually checked.

**Early closes are a shorter day, not a special case.** There is no early-close concept in the API:
the day simply has different session times. Anything else is over-modelling.

**Session times are local wall clock.** DST is handled by the IANA database. Never write a fixed
UTC offset, and never adjust a time "for summer".
