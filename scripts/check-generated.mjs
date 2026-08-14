// Proves that src/calendars/**/*.generated.ts is exactly what data/ says it
// should be. Runs offline in CI, so a pull request can verify the shipped
// calendar without anyone trusting the network or the person who ran the
// generator.
import { readFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from './build-calendars.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const files = await generate();
const stale = [];

for (const [path, expected] of files) {
  let actual;
  try {
    actual = await readFile(path, 'utf8');
  } catch {
    stale.push(`${relative(ROOT, path)} is missing`);
    continue;
  }
  if (actual !== expected) {
    stale.push(`${relative(ROOT, path)} does not match data/`);
  }
}

if (stale.length > 0) {
  console.error('Generated calendars are out of date:');
  for (const message of stale) console.error(`  - ${message}`);
  console.error('\nRun: npm run build:calendars');
  process.exit(1);
}

console.log(`${files.size} generated calendar file(s) match data/`);
