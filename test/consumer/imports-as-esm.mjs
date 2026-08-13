// Imports the package the way a consumer does: from a clean project with the
// packed tarball installed, never from the source tree. It exercises the
// exports map, the ESM build and the shipped calendar data together, so it
// fails if any of them did not survive publication.
import assert from 'node:assert/strict';

import { getMarket, getService, getTimeZoneSupport } from 'market-hours';

assert.equal(getTimeZoneSupport('Europe/London').supported, true);

const lse = getMarket('XLON');
assert.equal(lse.isOpen('2026-01-15T12:00:00Z'), true);
assert.equal(lse.isOpen('2026-01-15T17:00:00Z'), false);
assert.equal(lse.isOpen('2026-12-25T12:00:00Z'), false, 'Christmas Day');
assert.equal(lse.isOpen('2026-12-24T14:00:00Z'), false, 'half day');
assert.equal(lse.getStatus('2026-01-15T16:32:00Z').phase, 'closing-auction');

const rns = getService('RNS');
assert.equal(rns.isOpen('2026-01-15T18:00:00Z'), true);

assert.ok(lse.getCoverage().sources.length > 0);
assert.equal(typeof lse.isOpen(), 'boolean');

console.log('ESM import: OK');
