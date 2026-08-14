// The CommonJS half. An ESM-only package passes every unit test in this
// repository and then breaks every `require()` consumer on installation, so
// this is the only check that would notice.
const assert = require('node:assert/strict');

const { defineMarket, isMarketHoursError } = require('market-hours');
const { XLON, XLON_CALENDAR } = require('market-hours/xlon');
const { RNS } = require('market-hours/rns');

// A venue built at module scope has to survive the ESM-to-CJS transpilation
// too, not just the data behind it.
assert.equal(XLON.isOpen('2026-01-15T12:00:00Z'), true);
assert.equal(XLON.isOpen('2026-12-24T14:00:00Z'), false, 'half day');
assert.equal(XLON.getStatus('2026-01-15T16:32:00Z').phase, 'closing-auction');
assert.equal(RNS.isOpen('2026-01-15T18:00:00Z'), true);

assert.equal(typeof XLON_CALENDAR.holidays.length, 'number');
assert.equal(defineMarket(XLON_CALENDAR).id, 'XLON');

// Dates the calendar does not cover must refuse rather than guess.
try {
  XLON.isOpen('2099-12-25T12:00:00Z');
  assert.fail('should have thrown');
} catch (error) {
  assert.equal(isMarketHoursError(error), true);
  assert.equal(error.code, 'CALENDAR_HORIZON');
}

console.log('CommonJS require: OK');
