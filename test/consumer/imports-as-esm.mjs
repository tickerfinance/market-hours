// Imports the package the way a consumer does: from a clean project with the
// packed tarball installed, never from the source tree. It exercises the
// exports map, the ESM build and the shipped calendar data together, so it
// fails if any of them did not survive publication.
import assert from 'node:assert/strict';

import { defineMarket, defineService, getTimeZoneSupport } from 'market-hours';
import { XLON } from 'market-hours/xlon';
import { RNS } from 'market-hours/rns';

assert.equal(getTimeZoneSupport('Europe/London').supported, true);

const lse = defineMarket(XLON);
assert.equal(lse.isOpen('2026-01-15T12:00:00Z'), true);
assert.equal(lse.isOpen('2026-01-15T17:00:00Z'), false);
assert.equal(lse.isOpen('2026-12-25T12:00:00Z'), false, 'Christmas Day');
assert.equal(lse.isOpen('2026-12-24T14:00:00Z'), false, 'half day');
assert.equal(lse.getStatus('2026-01-15T16:32:00Z').phase, 'closing-auction');

const rns = defineService(RNS);
assert.equal(rns.isOpen('2026-01-15T18:00:00Z'), true);

assert.ok(lse.getCoverage().sources.length > 0);
assert.equal(typeof lse.isOpen(), 'boolean');

// The subpaths are the whole point of the exports map: a bundler can drop a
// calendar nobody imported.
assert.equal(XLON.id, 'XLON');
assert.equal(RNS.id, 'RNS');

console.log('ESM import: OK');
