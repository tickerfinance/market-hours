import { describe, expect, it } from 'vitest';

import { BUILT_IN_VENUES } from '../src/calendars/built-in.generated.js';
import type { VenueData } from '../src/index.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WALL_TIME = /^([01]\d|2[0-4]):[0-5]\d$/;

const minutes = (wallTime: string): number => {
  const [hour, minute] = wallTime.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
};

/** 0 = Sunday. Pure UTC arithmetic, independent of the host zone. */
const weekdayOf = (isoDate: string): number => {
  const [year, month, day] = isoDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

describe.each(BUILT_IN_VENUES.map((venue) => [venue.id, venue] as const))(
  'data/%s.json',
  (_id, venue: VenueData) => {
    it('declares a coverage range that makes sense', () => {
      expect(venue.coverage.from).toMatch(ISO_DATE);
      expect(venue.coverage.through).toMatch(ISO_DATE);
      expect(venue.coverage.from < venue.coverage.through).toBe(true);
    });

    it('cites where its data came from', () => {
      expect(venue.sources.length).toBeGreaterThan(0);
      for (const source of venue.sources) {
        expect(source.what).toBeTruthy();
        expect(source.licence).toBeTruthy();
        expect(source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('has sessions that are sorted, non-overlapping and half-open', () => {
      const all = [
        venue.sessions,
        ...venue.earlyCloses.map((entry) => entry.sessions),
      ];
      for (const sessions of all) {
        expect(sessions.length).toBeGreaterThan(0);
        let previousEnd = -1;
        for (const session of sessions) {
          expect(session.start).toMatch(WALL_TIME);
          expect(session.end).toMatch(WALL_TIME);
          expect(minutes(session.end)).toBeGreaterThan(minutes(session.start));
          expect(minutes(session.start)).toBeGreaterThanOrEqual(previousEnd);
          previousEnd = minutes(session.end);
        }
      }
    });

    it('only uses phases its venue type can have', () => {
      const allowed =
        venue.type === 'exchange'
          ? ['pre-open-auction', 'open', 'closing-auction']
          : ['open'];
      const phases = [
        venue.sessions,
        ...venue.earlyCloses.map((entry) => entry.sessions),
      ]
        .flat()
        .map((session) => session.phase);
      for (const phase of phases) expect(allowed).toContain(phase);
    });

    it('lists holidays sorted, unique and inside its coverage', () => {
      const dates = venue.holidays.map((holiday) => holiday.date);
      expect(dates).toEqual([...dates].sort());
      expect(new Set(dates).size).toBe(dates.length);
      for (const holiday of venue.holidays) {
        expect(holiday.date).toMatch(ISO_DATE);
        expect(holiday.name).toBeTruthy();
        expect(holiday.date >= venue.coverage.from).toBe(true);
        expect(holiday.date <= venue.coverage.through).toBe(true);
      }
    });

    it('never records a holiday that falls at a weekend', () => {
      // England and Wales substitute a weekday whenever a bank holiday lands on
      // a weekend, so a Saturday entry means the feed or the merge broke.
      for (const holiday of venue.holidays) {
        expect(
          venue.weekend.includes(weekdayOf(holiday.date)),
          `${holiday.date} (${holiday.name}) falls at a weekend`,
        ).toBe(false);
      }
    });

    it('lists early closes sorted, unique, and never on a closed day', () => {
      const dates = venue.earlyCloses.map((entry) => entry.date);
      expect(dates).toEqual([...dates].sort());
      expect(new Set(dates).size).toBe(dates.length);

      const holidays = new Set(venue.holidays.map((holiday) => holiday.date));
      for (const entry of venue.earlyCloses) {
        expect(entry.date).toMatch(ISO_DATE);
        expect(holidays.has(entry.date)).toBe(false);
        expect(venue.weekend.includes(weekdayOf(entry.date))).toBe(false);
      }
    });

    it('shortens the day on an early close rather than lengthening it', () => {
      const normalEnd = minutes(
        venue.sessions[venue.sessions.length - 1]?.end as string,
      );
      for (const entry of venue.earlyCloses) {
        const end = minutes(
          entry.sessions[entry.sessions.length - 1]?.end as string,
        );
        expect(end).toBeLessThan(normalEnd);
      }
    });
  },
);

describe('across venues', () => {
  it('gives every venue a distinct id', () => {
    const ids = BUILT_IN_VENUES.map((venue) => venue.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps venues in the same jurisdiction on the same holidays', () => {
    const byZone = new Map<string, VenueData[]>();
    for (const venue of BUILT_IN_VENUES) {
      const group = byZone.get(venue.timeZone) ?? [];
      group.push(venue);
      byZone.set(venue.timeZone, group);
    }

    for (const group of byZone.values()) {
      const [first, ...rest] = group;
      for (const venue of rest) {
        expect(venue.holidays, `${venue.id} vs ${first?.id}`).toEqual(
          first?.holidays,
        );
      }
    }
  });
});
