// The CommonJS half of the smoke test. An ESM-only package would pass every
// unit test in the repository and then break every `require()` consumer, and
// this is the only check that notices.
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

console.log('CommonJS smoke test passed');
