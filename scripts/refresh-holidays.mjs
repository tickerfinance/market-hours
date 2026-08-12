// Refreshes the holiday and early-close entries in data/*.json from their
// published sources. Run monthly by .github/workflows/calendar-refresh.yml,
// which opens a pull request with whatever this produces.
//
//   node scripts/refresh-holidays.mjs [--dry-run] [--allow-removals]
//
// This is the only script in the repository that touches the network. Nothing
// at runtime fetches anything.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, 'data');

const GOV_UK = 'https://www.gov.uk/bank-holidays.json';
const OGL =
  'Open Government Licence v3.0 — https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

/**
 * Per-venue refresh configuration. Deliberately not in data/*.json: those files
 * are pure runtime data, and every date in them is explicit.
 *
 * `earlyCloseDays` proposes candidates only. A newly proposed date must be
 * confirmed against the venue's published calendar before the refresh pull
 * request is merged — see docs/calendar-data.md.
 */
const VENUES = {
  XLON: {
    division: 'england-and-wales',
    earlyCloseDays: ['12-24', '12-31'],
    earlyCloseSessions: [
      { phase: 'pre-open-auction', start: '07:50', end: '08:00' },
      { phase: 'open', start: '08:00', end: '12:30' },
      { phase: 'closing-auction', start: '12:30', end: '12:35' },
    ],
  },
  RNS: {
    division: 'england-and-wales',
    earlyCloseDays: ['12-24', '12-31'],
    earlyCloseSessions: [{ phase: 'open', start: '07:00', end: '13:30' }],
  },
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const allowRemovals = args.has('--allow-removals');

/** Weekday of a YYYY-MM-DD date. 0 = Sunday. Pure UTC, never host-local. */
function weekdayOf(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function sortByDate(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBankHolidays() {
  const response = await fetch(GOV_UK, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`${GOV_UK} responded ${response.status}`);
  }
  return response.json();
}

function mergeHolidays(existing, incoming, venueId) {
  const byDate = new Map(existing.map((entry) => [entry.date, entry]));
  const added = [];
  const changed = [];

  for (const event of incoming) {
    const previous = byDate.get(event.date);
    const next = { date: event.date, name: event.title };
    if (previous === undefined) {
      added.push(next);
    } else if (previous.name !== next.name) {
      changed.push({ date: next.date, from: previous.name, to: next.name });
    }
    byDate.set(event.date, next);
  }

  // The feed is a rolling window that drops old years, so anything outside its
  // range is history we already verified and must keep. A date missing from
  // *inside* the window is a genuine upstream correction and worth a human.
  const incomingDates = new Set(incoming.map((event) => event.date));
  const first = incoming[0]?.date ?? '';
  const last = incoming[incoming.length - 1]?.date ?? '';
  const removed = existing.filter(
    (entry) =>
      entry.date >= first &&
      entry.date <= last &&
      !incomingDates.has(entry.date),
  );

  if (removed.length > 0 && !allowRemovals) {
    throw new Error(
      `${venueId}: upstream dropped ${removed.length} holiday(s) inside its own window ` +
        `(${removed.map((entry) => entry.date).join(', ')}). ` +
        'Re-run with --allow-removals once you have confirmed this is a real correction.',
    );
  }

  return {
    holidays: sortByDate([...byDate.values()]),
    added,
    changed,
    removed,
  };
}

function proposeEarlyCloses(venue, config, holidays, throughYear) {
  const holidayDates = new Set(holidays.map((entry) => entry.date));
  const existing = new Map(
    venue.earlyCloses.map((entry) => [entry.date, entry]),
  );
  const fromYear = Number(venue.coverage.from.slice(0, 4));

  const result = [];
  const added = [];

  for (let year = fromYear; year <= throughYear; year += 1) {
    for (const monthDay of config.earlyCloseDays) {
      const date = `${year}-${monthDay}`;
      const weekday = weekdayOf(date);
      const isWeekend = venue.weekend.includes(weekday);
      if (isWeekend || holidayDates.has(date)) continue;

      const previous = existing.get(date);
      if (previous === undefined) {
        added.push(date);
        result.push({ date, sessions: config.earlyCloseSessions });
      } else {
        // Never overwrite a hand-corrected entry.
        result.push(previous);
      }
    }
  }

  return { earlyCloses: sortByDate(result), added };
}

async function main() {
  const feed = await fetchBankHolidays();
  const retrievedAt = new Date().toISOString();
  const summary = [];

  for (const [venueId, config] of Object.entries(VENUES)) {
    const path = join(DATA, `${venueId}.json`);
    const venue = JSON.parse(await readFile(path, 'utf8'));

    const division = feed[config.division];
    if (division === undefined) {
      throw new Error(`${GOV_UK} has no '${config.division}' division`);
    }
    const events = division.events;

    const merged = mergeHolidays(venue.holidays, events, venueId);

    // Only whole years the feed actually covers count as verified.
    const lastYear = Number(events[events.length - 1].date.slice(0, 4));
    const through = `${lastYear}-12-31`;

    const proposed = proposeEarlyCloses(
      { ...venue, earlyCloses: venue.earlyCloses },
      config,
      merged.holidays,
      lastYear,
    );

    const next = {
      ...venue,
      coverage: { ...venue.coverage, through },
      sources: [
        {
          what: 'Bank holidays',
          url: GOV_UK,
          division: config.division,
          licence: OGL,
          retrievedAt,
        },
        ...venue.sources.filter((source) => source.url !== GOV_UK),
      ],
      holidays: merged.holidays,
      earlyCloses: proposed.earlyCloses,
    };

    summary.push({
      venueId,
      through,
      addedHolidays: merged.added,
      changedHolidays: merged.changed,
      removedHolidays: merged.removed,
      addedEarlyCloses: proposed.added,
    });

    if (!dryRun) {
      await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
    }
  }

  report(summary);
}

function report(summary) {
  const lines = [];
  for (const entry of summary) {
    lines.push(`### ${entry.venueId}`);
    lines.push(`Coverage now runs through **${entry.through}**.`);
    lines.push('');
    const bullet = (label, items) => {
      if (items.length === 0) return;
      lines.push(`- ${label}: ${items.length}`);
      for (const item of items) {
        lines.push(
          `  - ${typeof item === 'string' ? item : (item.date ?? JSON.stringify(item))}` +
            (item.name ? ` — ${item.name}` : '') +
            (item.from ? ` — '${item.from}' → '${item.to}'` : ''),
        );
      }
    };
    bullet('Holidays added', entry.addedHolidays);
    bullet('Holidays renamed', entry.changedHolidays);
    bullet('Holidays removed', entry.removedHolidays);
    bullet('Early closes proposed', entry.addedEarlyCloses);
    if (
      entry.addedHolidays.length === 0 &&
      entry.changedHolidays.length === 0 &&
      entry.removedHolidays.length === 0 &&
      entry.addedEarlyCloses.length === 0
    ) {
      lines.push('- No changes.');
    }
    lines.push('');
  }

  if (summary.some((entry) => entry.addedEarlyCloses.length > 0)) {
    lines.push('> **Early closes above are proposals, not facts.**');
    lines.push(
      "> Confirm each one against the venue's published calendar before merging.",
    );
    lines.push('');
  }

  const text = lines.join('\n');
  console.log(text);

  if (process.env.GITHUB_STEP_SUMMARY) {
    return writeFile(process.env.GITHUB_STEP_SUMMARY, text, { flag: 'a' });
  }
  return undefined;
}

await main();
