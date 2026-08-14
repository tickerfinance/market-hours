// Runs the whole test suite once per host time zone.
//
// A market-hours library that only works on a UTC server is the problem, not
// the solution. Each zone below exists to break a specific wrong assumption:
//
//   UTC                  the happy path, and the only one CI would test by default
//   Europe/London        host zone equals venue zone, which hides offset bugs
//   America/New_York     negative whole-hour offset
//   America/St_Johns     negative half-hour offset (-03:30)
//   Asia/Kolkata         positive half-hour offset (+05:30), no DST
//   Pacific/Chatham      45-minute offset (+12:45 / +13:45)
//   Australia/Lord_Howe  DST step of 30 minutes rather than an hour
//   Pacific/Kiritimati   +14, always a day ahead of UTC
import { spawnSync } from 'node:child_process';

const ZONES = [
  'UTC',
  'Europe/London',
  'America/New_York',
  'America/St_Johns',
  'Asia/Kolkata',
  'Pacific/Chatham',
  'Australia/Lord_Howe',
  'Pacific/Kiritimati',
];

const failures = [];
const width = Math.max(...ZONES.map((zone) => zone.length));

for (const zone of ZONES) {
  const started = process.hrtime.bigint();
  const result = spawnSync('npx', ['vitest', 'run'], {
    encoding: 'utf8',
    env: { ...process.env, TZ: zone },
    shell: false,
  });
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const counts = /Tests\s+(.*)/.exec(output)?.[1]?.trim() ?? 'no summary';
  const ok = result.status === 0;

  console.log(
    `${ok ? 'PASS' : 'FAIL'}  TZ=${zone.padEnd(width)}  ${counts}  (${seconds.toFixed(1)}s)`,
  );

  if (!ok) {
    failures.push(zone);
    console.error(output);
  }
}

if (failures.length > 0) {
  console.error(
    `\nFAILED in ${failures.length} zone(s): ${failures.join(', ')}`,
  );
  process.exit(1);
}

console.log(`\nAll green in ${ZONES.length} host time zones.`);
