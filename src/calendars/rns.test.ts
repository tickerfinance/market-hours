import { describe, expect, it } from 'vitest';

import { getMarket, getService } from '../core/registry.js';
import { RNS } from './news-services/RNS.generated.js';
import { XLON } from './exchanges/XLON.generated.js';

const rns = getService('RNS');

const GMT_DAY = '2026-01-15'; // ordinary Thursday, London local = UTC
const BST_DAY = '2026-07-15'; // ordinary Wednesday, London local = UTC+1

describe('an ordinary day', () => {
  it.each([
    ['06:59:59.999', 'closed'],
    ['07:00:00.000', 'open'],
    ['12:00:00.000', 'open'],
    ['19:29:59.999', 'open'],
    ['19:30:00.000', 'closed'],
  ])('%s is %s', (time, phase) => {
    expect(rns.getStatus(`${GMT_DAY}T${time}Z`).phase).toBe(phase);
  });

  it('shifts with British Summer Time', () => {
    expect(rns.getStatus(`${BST_DAY}T05:59:59.999Z`).phase).toBe('closed');
    expect(rns.getStatus(`${BST_DAY}T06:00:00.000Z`).phase).toBe('open');
    expect(rns.getStatus(`${BST_DAY}T18:29:59.999Z`).phase).toBe('open');
    expect(rns.getStatus(`${BST_DAY}T18:30:00.000Z`).phase).toBe('closed');
  });

  it('is still running after the exchange has closed', () => {
    const lse = getMarket('XLON');
    const evening = `${GMT_DAY}T18:00:00Z`;
    expect(lse.isOpen(evening)).toBe(false);
    expect(rns.isOpen(evening)).toBe(true);
  });
});

describe('a news service has no auctions', () => {
  it('only ever reports open or closed', () => {
    const start = Date.parse(`${GMT_DAY}T00:00:00Z`);
    const phases = new Set<string>();
    for (let ms = start; ms < start + 86_400_000; ms += 60_000) {
      phases.add(rns.getStatus(ms).phase);
    }
    expect([...phases].sort()).toEqual(['closed', 'open']);
  });

  it('reports inSession identically to isOpen', () => {
    for (const time of ['06:00', '07:00', '12:00', '19:00', '20:00']) {
      const at = `${GMT_DAY}T${time}:00Z`;
      expect(rns.inSession(at)).toBe(rns.isOpen(at));
    }
  });
});

describe('weekends and holidays', () => {
  it('is shut all weekend', () => {
    expect(rns.isTradingDay('2026-01-17')).toBe(false);
    expect(rns.isTradingDay('2026-01-18')).toBe(false);
    expect(rns.isOpen('2026-01-17T12:00:00Z')).toBe(false);
  });

  it('is shut on every bank holiday', () => {
    for (const holiday of RNS.holidays) {
      expect(rns.isOpen(`${holiday.date}T12:00:00Z`)).toBe(false);
      expect(rns.getSchedule(holiday.date).holiday).toBe(holiday.name);
    }
  });

  it('shares its holiday calendar with the exchange', () => {
    expect(RNS.holidays).toEqual(XLON.holidays);
  });
});

describe('half days', () => {
  it.each(RNS.earlyCloses.map((entry) => entry.date))(
    '%s stops at 13:30 local',
    (date) => {
      expect(rns.isOpen(`${date}T13:29:59.999Z`)).toBe(true);
      expect(rns.isOpen(`${date}T13:30:00.000Z`)).toBe(false);
    },
  );

  it('keeps running for an hour after the exchange has shut', () => {
    const lse = getMarket('XLON');
    const afternoon = '2026-12-24T13:00:00Z';
    expect(lse.isOpen(afternoon)).toBe(false);
    expect(rns.isOpen(afternoon)).toBe(true);
  });

  it('covers the same dates as the exchange', () => {
    expect(RNS.earlyCloses.map((entry) => entry.date)).toEqual(
      XLON.earlyCloses.map((entry) => entry.date),
    );
  });
});

describe('transitions', () => {
  it('opens next on the following weekday morning', () => {
    expect(rns.nextOpen('2026-01-16T20:00:00Z').toISOString()).toBe(
      '2026-01-19T07:00:00.000Z',
    );
  });

  it('closes at the end of the current day', () => {
    expect(rns.nextClose(`${GMT_DAY}T12:00:00Z`).toISOString()).toBe(
      `${GMT_DAY}T19:30:00.000Z`,
    );
  });
});
