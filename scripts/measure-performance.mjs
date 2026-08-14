#!/usr/bin/env node
/**
 * Measures the numbers quoted under "Performance" in README.md, against the
 * built ESM output rather than the sources.
 *
 * A documented figure nobody can reproduce is a rumour. Run this after
 * `npm run build` and update the README when the numbers move.
 */
import { defineMarket } from '../dist/esm/index.js';
import {
  XLON,
  XLON_CALENDAR,
} from '../dist/esm/calendars/exchanges/XLON.generated.js';

const ITERATIONS = 200_000;

/** Spread across a year so the day cache is exercised, not defeated. */
const INSTANTS = Array.from(
  { length: 512 },
  (_, i) => Date.UTC(2026, 0, 1) + i * 17 * 3_600_000 + i * 37 * 60_000,
);

function measure(label, run) {
  // Warm up, so we time steady-state rather than the JIT.
  for (let i = 0; i < 10_000; i += 1) run(INSTANTS[i % INSTANTS.length]);

  const started = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i += 1) run(INSTANTS[i % INSTANTS.length]);
  const elapsedNs = Number(process.hrtime.bigint() - started);

  const perCall = elapsedNs / ITERATIONS / 1000;
  console.log(`${label.padEnd(28)} ${perCall.toFixed(2)} µs`);
}

const lse = XLON;

// The first call builds the Intl formatter for the zone; time it alone. A
// freshly built venue, because the shipped one has already been warmed by the
// import above.
const coldStarted = process.hrtime.bigint();
defineMarket(XLON_CALENDAR).isOpen(INSTANTS[0]);
const coldMs = Number(process.hrtime.bigint() - coldStarted) / 1e6;

console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
console.log(`${ITERATIONS.toLocaleString('en-GB')} calls each\n`);

measure('isOpen', (at) => lse.isOpen(at));
measure('getStatus', (at) => lse.getStatus(at));
measure('getSchedule', (at) => lse.getSchedule(at));
measure('nextTransition', (at) => lse.nextTransition(at));
measure('getStatus + nextTransition', (at) => {
  lse.getStatus(at);
  lse.nextTransition(at);
});

console.log(`\nfirst call to a new venue    ${coldMs.toFixed(2)} ms`);
