// Asserts the documented behaviour on a runtime whose Intl cannot be trusted.
//
// Some engines — notably older React Native builds — accept an IANA zone name
// and then quietly format in UTC. That would make every London answer an hour
// wrong for seven months of the year, silently. The contract is that this
// package refuses to answer rather than answering wrongly.
//
// Each scenario runs in its own process. Time-zone support is probed once and
// memoised, on the reasonable assumption that a runtime does not acquire
// time-zone data halfway through its life, so scenarios would otherwise poison
// each other.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const pad = (value) => String(value).padStart(2, '0');

const SCENARIOS = {
  'no-intl': () => undefined,

  'no-time-zone-support': () => ({
    DateTimeFormat: class {
      constructor() {
        throw new RangeError('Invalid time zone specified');
      }
    },
  }),

  // The dangerous one: nothing throws, every call succeeds, every answer is
  // silently in UTC.
  'incorrect-offsets': () => ({
    DateTimeFormat: class {
      formatToParts(date) {
        return [
          { type: 'year', value: String(date.getUTCFullYear()) },
          { type: 'month', value: pad(date.getUTCMonth() + 1) },
          { type: 'day', value: pad(date.getUTCDate()) },
          { type: 'hour', value: pad(date.getUTCHours()) },
          { type: 'minute', value: pad(date.getUTCMinutes()) },
        ];
      }
    },
  }),
};

const scenario = process.argv[2];

if (scenario === undefined) {
  const names = [...Object.keys(SCENARIOS), 'healthy'];
  for (const name of names) {
    const result = spawnSync(process.execPath, [SELF, name], {
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log(`degraded-runtime smoke test passed (${names.length} scenarios)`);
  process.exit(0);
}

const { getMarket, getTimeZoneSupport, isMarketHoursError } =
  await import('../../dist/esm/index.js');

if (scenario === 'healthy') {
  assert.equal(getTimeZoneSupport('Europe/London').supported, true);
  assert.equal(getMarket('XLON').isOpen('2026-01-15T12:00:00Z'), true);
  console.log('  healthy: answers normally');
  process.exit(0);
}

globalThis.Intl = SCENARIOS[scenario]();

const support = getTimeZoneSupport('Europe/London');
assert.equal(support.supported, false);
assert.equal(support.reason, scenario);

// A summer instant, when London is an hour ahead of UTC. A package that
// trusted this runtime would answer "open" and be wrong.
try {
  getMarket('XLON').isOpen('2026-07-15T15:45:00Z');
  assert.fail('should have refused to answer');
} catch (error) {
  assert.equal(isMarketHoursError(error), true, 'must be a MarketHoursError');
  assert.equal(error.code, 'TIME_ZONE_UNAVAILABLE');
}

console.log(`  ${scenario}: refused to answer`);
