import { describe, expect, it } from 'vitest';

import { defineMarket } from '../core/define.js';
import { isMarketHoursError } from '../errors.js';
import { XLON, XLON_CALENDAR } from './exchanges/XLON.generated.js';

// The shipped venue, not one built here: these assertions are about what
// consumers actually import.
const lse = XLON;

/** 2026-01-15 is an ordinary Thursday in GMT: London local time is UTC. */
const GMT_DAY = '2026-01-15';
/** 2026-07-15 is an ordinary Wednesday in BST: London local is UTC+1. */
const BST_DAY = '2026-07-15';

const phaseAt = (iso: string): string => lse.getStatus(iso).phase;

describe('an ordinary trading day in GMT', () => {
  it.each([
    ['07:49:59.999', 'closed'],
    ['07:50:00.000', 'pre-open-auction'],
    ['07:59:59.999', 'pre-open-auction'],
    ['08:00:00.000', 'open'],
    ['16:29:59.999', 'open'],
    ['16:30:00.000', 'closing-auction'],
    ['16:34:59.999', 'closing-auction'],
    ['16:35:00.000', 'closed'],
    ['23:59:59.999', 'closed'],
  ])('%s is %s', (time, phase) => {
    expect(phaseAt(`${GMT_DAY}T${time}Z`)).toBe(phase);
  });

  it('is open for continuous trading but not during the auctions', () => {
    expect(lse.isOpen(`${GMT_DAY}T12:00:00Z`)).toBe(true);
    expect(lse.isOpen(`${GMT_DAY}T16:32:00Z`)).toBe(false);
    expect(lse.inSession(`${GMT_DAY}T16:32:00Z`)).toBe(true);
    expect(lse.inSession(`${GMT_DAY}T07:55:00Z`)).toBe(true);
    expect(lse.inSession(`${GMT_DAY}T17:00:00Z`)).toBe(false);
  });

  it('counts the auction as in session but not as open', () => {
    // The distinction one prior implementation approximated by moving its
    // close to 16:45. Orders execute in the auction; the book is not open.
    expect(lse.isOpen(`${GMT_DAY}T16:32:00Z`)).toBe(false);
    expect(lse.inSession(`${GMT_DAY}T16:32:00Z`)).toBe(true);
    expect(lse.inSession(`${GMT_DAY}T16:35:00Z`)).toBe(false);
  });
});

describe('the same day in BST', () => {
  it('keeps local session times fixed while the UTC instants shift', () => {
    // 08:00 London is 07:00Z in summer and 08:00Z in winter. Anything that
    // hard-codes UTC hours gets this wrong twice a year.
    expect(phaseAt(`${BST_DAY}T06:59:59.999Z`)).toBe('pre-open-auction');
    expect(phaseAt(`${BST_DAY}T07:00:00.000Z`)).toBe('open');
    expect(phaseAt(`${BST_DAY}T15:29:59.999Z`)).toBe('open');
    expect(phaseAt(`${BST_DAY}T15:30:00.000Z`)).toBe('closing-auction');
  });

  it('reports local wall-clock time, not UTC', () => {
    const status = lse.getStatus(`${BST_DAY}T07:00:00Z`);
    expect(status.localTime).toBe('08:00:00.000');
    expect(status.localDate).toBe(BST_DAY);
  });
});

describe('no instant is unclassified', () => {
  it('assigns a phase to every second of a trading day', () => {
    // The dead-minute defect: an exclusive comparison that keeps seconds leaves
    // 08:00:00-08:00:59 in no interval at all, so the market reads closed for
    // the first minute of every session.
    const start = Date.parse(`${GMT_DAY}T00:00:00Z`);
    const phases = new Set<string>();
    for (let ms = start; ms < start + 86_400_000; ms += 1000) {
      phases.add(lse.getStatus(ms).phase);
    }
    expect([...phases].sort()).toEqual([
      'closed',
      'closing-auction',
      'open',
      'pre-open-auction',
    ]);
  });

  it('flips exactly on the millisecond, not the minute', () => {
    for (const [before, at] of [
      ['07:49:59.999', '07:50:00.000'],
      ['07:59:59.999', '08:00:00.000'],
      ['16:29:59.999', '16:30:00.000'],
      ['16:34:59.999', '16:35:00.000'],
    ]) {
      expect(phaseAt(`${GMT_DAY}T${before}Z`)).not.toBe(
        phaseAt(`${GMT_DAY}T${at}Z`),
      );
    }
  });
});

describe('weekends and holidays', () => {
  it('is shut all weekend', () => {
    expect(lse.isTradingDay('2026-01-17')).toBe(false); // Saturday
    expect(lse.isTradingDay('2026-01-18')).toBe(false); // Sunday
    expect(lse.isOpen('2026-01-17T12:00:00Z')).toBe(false);
    expect(lse.getSchedule('2026-01-17').sessions).toHaveLength(0);
  });

  it('is shut on every holiday in the shipped calendar', () => {
    for (const holiday of XLON_CALENDAR.holidays) {
      const schedule = lse.getSchedule(holiday.date);
      expect(schedule.sessions).toHaveLength(0);
      expect(schedule.holiday).toBe(holiday.name);
      for (const time of ['09:00', '12:00', '16:00']) {
        expect(lse.isOpen(`${holiday.date}T${time}:00Z`)).toBe(false);
      }
    }
  });

  it('names the holiday in the status', () => {
    const status = lse.getStatus('2026-12-25T12:00:00Z');
    expect(status.holiday).toBe('Christmas Day');
    expect(status.phase).toBe('closed');
  });

  it('trades normally on the days either side of a holiday', () => {
    expect(lse.isOpen('2026-12-24T09:00:00Z')).toBe(true);
    expect(lse.isOpen('2026-12-29T09:00:00Z')).toBe(true);
  });
});

describe('half days', () => {
  it.each(XLON_CALENDAR.earlyCloses.map((entry) => entry.date))(
    '%s closes early',
    (date) => {
      const schedule = lse.getSchedule(date);
      const last = schedule.sessions[schedule.sessions.length - 1];
      expect(schedule.sessions.length).toBeGreaterThan(0);
      expect(last).toBeDefined();

      // Open in the morning, shut in the afternoon. Every prior implementation
      // reported these days open until 16:30.
      expect(lse.isOpen(`${date}T10:00:00Z`)).toBe(true);
      expect(lse.isOpen(`${date}T14:00:00Z`)).toBe(false);
      expect(lse.inSession(`${date}T14:00:00Z`)).toBe(false);
    },
  );

  it('runs the closing auction straight after the early close', () => {
    expect(phaseAt('2026-12-24T12:29:59.999Z')).toBe('open');
    expect(phaseAt('2026-12-24T12:30:00.000Z')).toBe('closing-auction');
    expect(phaseAt('2026-12-24T12:35:00.000Z')).toBe('closed');
  });

  it('never lets Christmas Eve or New Year’s Eve be a full trading day', () => {
    const earlyCloses = new Set(
      XLON_CALENDAR.earlyCloses.map((entry) => entry.date),
    );
    const fromYear = Number(XLON_CALENDAR.coverage.from.slice(0, 4));
    const throughYear = Number(XLON_CALENDAR.coverage.through.slice(0, 4));

    for (let year = fromYear; year <= throughYear; year += 1) {
      for (const monthDay of ['12-24', '12-31']) {
        const date = `${year}-${monthDay}`;
        const isTradingDay = lse.isTradingDay(date);
        if (isTradingDay) {
          expect(earlyCloses.has(date), `${date} is a full trading day`).toBe(
            true,
          );
        }
      }
    }
  });
});

describe('transitions', () => {
  it('steps to the next phase boundary', () => {
    const transition = lse.nextTransition(`${GMT_DAY}T12:00:00Z`);
    expect(transition.at.toISOString()).toBe(`${GMT_DAY}T16:30:00.000Z`);
    expect(transition.from).toBe('open');
    expect(transition.to).toBe('closing-auction');
  });

  it('walks over the weekend from Friday evening', () => {
    // Friday 2026-01-16 17:00 -> Monday 2026-01-19 07:50
    const transition = lse.nextTransition('2026-01-16T17:00:00Z');
    expect(transition.at.toISOString()).toBe('2026-01-19T07:50:00.000Z');
    expect(transition.from).toBe('closed');
    expect(transition.to).toBe('pre-open-auction');
  });

  it('skips a bank holiday Monday', () => {
    // Friday 2026-05-01 after the close; Monday 2026-05-04 is a bank holiday.
    expect(lse.nextOpen('2026-05-01T17:00:00Z').toISOString()).toBe(
      '2026-05-05T07:00:00.000Z',
    );
  });

  it('reports the next open and close', () => {
    expect(lse.nextOpen(`${GMT_DAY}T06:00:00Z`).toISOString()).toBe(
      `${GMT_DAY}T08:00:00.000Z`,
    );
    expect(lse.nextClose(`${GMT_DAY}T09:00:00Z`).toISOString()).toBe(
      `${GMT_DAY}T16:30:00.000Z`,
    );
  });

  it('keeps local times steady across the spring transition', () => {
    // The clocks change on Sunday 2026-03-29, between two trading days.
    expect(lse.nextOpen('2026-03-27T17:00:00Z').toISOString()).toBe(
      '2026-03-30T07:00:00.000Z',
    );
    expect(lse.getStatus('2026-03-30T07:00:00Z').localTime).toBe(
      '08:00:00.000',
    );
  });

  it('always moves forward', () => {
    let cursor = Date.parse('2026-01-01T00:00:00Z');
    for (let step = 0; step < 200; step += 1) {
      const next = lse.nextTransition(cursor).at.getTime();
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });
});

describe('getSchedule accepts a date or an instant', () => {
  it('reads a YYYY-MM-DD as the venue-local civil date', () => {
    expect(lse.getSchedule('2026-12-24').date).toBe('2026-12-24');
  });

  it('reads an instant as the venue-local day containing it', () => {
    // 23:30Z on the 24th is still the 24th in London; in BST it would not be.
    expect(lse.getSchedule(new Date('2026-12-24T23:30:00Z')).date).toBe(
      '2026-12-24',
    );
    expect(lse.getSchedule('2026-07-15T23:30:00Z').date).toBe('2026-07-16');
    expect(lse.getSchedule(Date.parse('2026-12-24T12:00:00Z')).date).toBe(
      '2026-12-24',
    );
  });

  it('defaults to today', () => {
    expect(lse.getSchedule().date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('a venue that never opens', () => {
  it('reports that rather than looping forever', () => {
    // A venue whose calendar has no continuous session can never enter one, so
    // asking when it next opens is unanswerable. It must terminate with a typed
    // error rather than spin to the lookahead limit and beyond.
    const auctionOnly = defineMarket({
      ...XLON_CALENDAR,
      sessions: [{ phase: 'pre-open-auction', start: '08:00', end: '08:10' }],
      earlyCloses: [],
    });

    try {
      auctionOnly.nextOpen('2026-01-15T12:00:00Z');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isMarketHoursError(error)).toBe(true);
      if (isMarketHoursError(error)) {
        expect(error.code).toBe('NO_TRANSITION_FOUND');
      }
    }
  });
});

describe('the day cache is bounded', () => {
  it('keeps answering correctly after eviction', () => {
    // A caller sweeping a long date range must not grow memory without limit,
    // and must not start giving different answers once the cache turns over.
    const probe = '2026-01-15T12:00:00Z';
    expect(lse.isOpen(probe)).toBe(true);

    // Comfortably more distinct days than the cache holds.
    let day = Date.UTC(2019, 0, 1);
    for (let i = 0; i < 1500; i += 1) {
      lse.getSchedule(day);
      day += 86_400_000;
    }

    expect(lse.isOpen(probe)).toBe(true);
    expect(lse.getStatus(probe).phase).toBe('open');
    expect(lse.isOpen('2026-12-25T12:00:00Z')).toBe(false);
  });
});

describe('coverage', () => {
  it('reports the verified range and its sources', () => {
    const coverage = lse.getCoverage();
    expect(coverage.venueId).toBe('XLON');
    expect(coverage.through).toBe(XLON_CALENDAR.coverage.through);
    expect(coverage.sources.length).toBeGreaterThan(0);
    expect(coverage.sources[0]?.licence).toContain('Open Government Licence');
  });

  it('answers inside the horizon and refuses outside it', () => {
    expect(() => lse.getStatus(`${GMT_DAY}T12:00:00Z`)).not.toThrow();
    expect(() => lse.getStatus('2035-06-13T12:00:00Z')).toThrowError(
      /verified holidays/,
    );
  });
});
