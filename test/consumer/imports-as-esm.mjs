// Imports the package the way a consumer does: from a clean project with the
// packed tarball installed, never from the source tree. It exercises the
// exports map, the ESM build and the shipped calendar data together, so it
// fails if any of them did not survive publication.
import assert from 'node:assert/strict';

import { defineMarket, getTimeZoneSupport } from 'market-hours';
import { XLON, XLON_CALENDAR } from 'market-hours/xlon';
import { RNS } from 'market-hours/rns';

assert.equal(getTimeZoneSupport('Europe/London').supported, true);

// The documented one-liner: import the venue, query it. If this needed a
// `defineMarket` call the package would have failed its own README.
assert.equal(XLON.isOpen('2026-01-15T12:00:00Z'), true);
assert.equal(XLON.isOpen('2026-01-15T17:00:00Z'), false);
assert.equal(XLON.isOpen('2026-12-25T12:00:00Z'), false, 'Christmas Day');
assert.equal(XLON.isOpen('2026-12-24T14:00:00Z'), false, 'half day');
assert.equal(XLON.getStatus('2026-01-15T16:32:00Z').phase, 'closing-auction');
assert.equal(RNS.isOpen('2026-01-15T18:00:00Z'), true);

assert.ok(XLON.getCoverage().sources.length > 0);
assert.equal(typeof XLON.isOpen(), 'boolean');

// The escape hatch has to survive packaging too: same subpath, raw calendar,
// rebuilt with a longer horizon.
const extended = defineMarket({
  ...XLON_CALENDAR,
  coverage: { from: '2019-01-01', through: '2030-12-31' },
});
assert.equal(extended.isOpen('2030-06-13T12:00:00Z'), true);
assert.equal(XLON_CALENDAR.coverage.through, '2028-12-31', 'not mutated');

console.log('ESM import: OK');
