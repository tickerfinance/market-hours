// The CommonJS half. An ESM-only package passes every unit test in this
// repository and then breaks every `require()` consumer on installation, so
// this is the only check that would notice.
const assert = require('node:assert/strict');

const { getMarket, getService, isMarketHoursError } = require('market-hours');

const lse = getMarket('XLON');
assert.equal(lse.isOpen('2026-01-15T12:00:00Z'), true);
assert.equal(lse.isOpen('2026-12-24T14:00:00Z'), false, 'half day');
assert.equal(lse.getStatus('2026-01-15T16:32:00Z').phase, 'closing-auction');
assert.equal(getService('RNS').isOpen('2026-01-15T18:00:00Z'), true);

try {
  getMarket('XPAR');
  assert.fail('should have thrown');
} catch (error) {
  assert.equal(isMarketHoursError(error), true);
  assert.equal(error.code, 'UNKNOWN_VENUE');
}

console.log('CommonJS require: OK');
