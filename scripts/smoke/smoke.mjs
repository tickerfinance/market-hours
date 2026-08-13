// Runs against the packed tarball installed into a clean project, not against
// the source tree. Proves the exports map, the ESM build and the shipped data
// all survive publication.
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

console.log('ESM smoke test passed');
