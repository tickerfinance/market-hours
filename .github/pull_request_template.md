## What and why

<!-- What changes, and what problem it solves. -->

## Checklist

- [ ] `npm run verify` passes
- [ ] `npm run test:tz` passes — the suite is green under every host time zone
- [ ] No host-local `Date` method has been introduced in `src/` (`getHours`, `getDay`,
      `toLocaleString`, `getTimezoneOffset`, …)
- [ ] No runtime dependency, Node built-in, `process` or filesystem access has been added

### If this changes `data/`

- [ ] `npm run build:calendars` has been run and the generated files are committed
- [ ] Every new or changed date cites a public source
- [ ] Early closes have been confirmed against the venue's published calendar — the bank holiday
      feed does not publish them
- [ ] `CHANGELOG.md` records it as a **minor**, not a patch

### If this changes the public API

- [ ] The exported-name snapshot in `src/index.test.ts` is updated deliberately
- [ ] The README API section is updated
- [ ] `CHANGELOG.md` records whether this is a major or a minor
