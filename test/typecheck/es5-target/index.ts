// A consumer that touches every public export.
//
// This file is copied into each fixture directory unchanged; only the tsconfig
// differs. Types are imported with `import type` throughout so the same source
// compiles under `verbatimModuleSyntax` and under TypeScript 4.8.
import {
  defineMarket,
  defineService,
  fromZonedParts,
  getTimeZoneOffsetMs,
  getTimeZoneSupport,
  isMarketHoursError,
  MarketHoursError,
  toEpochMs,
  toZonedParts,
} from 'market-hours';
import { XLON, XLON_CALENDAR } from 'market-hours/xlon';
import { RNS } from 'market-hours/rns';
import type {
  Coverage,
  DateInput,
  DaySchedule,
  Disambiguation,
  ErrorCode,
  ExchangePhase,
  InstantInput,
  Interval,
  IsoDate,
  Market,
  Phase,
  ProvenanceEntry,
  QueryOptions,
  Service,
  ServicePhase,
  Session,
  SessionTemplate,
  Status,
  VenueOptions,
  TimeZoneSupport,
  Transition,
  Venue,
  VenueData,
  VenueType,
  ZonedParts,
  ZonedPartsInput,
} from 'market-hours';

// The shipped venues are already built; `Market`/`Service` here asserts the
// generated .d.ts says so, under every tsconfig shape a consumer might have.
const lse: Market = XLON;
const rns: Service = RNS;
const shippedCalendar: VenueData<'exchange'> = XLON_CALENDAR;

const anInstant: InstantInput = '2026-12-24T09:00:00Z';
const aDate: DateInput = '2026-12-24';
const instants: InstantInput[] = [new Date(), 1766563200000, anInstant];
const dates: DateInput[] = [aDate, new Date()];
const isoDate: IsoDate = '2026-12-24';

const options: QueryOptions = { include: ['open', 'closing-auction'] };

const open: boolean = lse.isOpen(anInstant, options);
const inSession: boolean = lse.inSession();
const tradingDay: boolean = lse.isTradingDay(aDate);

const status: Status<ExchangePhase> = lse.getStatus(isoDate + 'T12:00:00Z');
const schedule: DaySchedule<ExchangePhase> = lse.getSchedule(isoDate);
const transition: Transition<ExchangePhase> = lse.nextTransition();
const nextOpen: Date = lse.nextOpen();
const nextClose: Date = lse.nextClose(undefined, options);
const coverage: Coverage = lse.getCoverage();
const sources: ReadonlyArray<ProvenanceEntry> = coverage.sources;

// Phases are string-literal unions, so a switch is exhaustive without an enum.
function describe(phase: ExchangePhase): string {
  switch (phase) {
    case 'open':
      return 'trading';
    case 'pre-open-auction':
      return 'opening auction';
    case 'closing-auction':
      return 'closing auction';
    case 'closed':
      return 'shut';
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

const servicePhase: ServicePhase = rns.getStatus().phase;
const anyPhase: Phase = servicePhase;
const venueType: VenueType = lse.type;
const asVenue: Venue<ExchangePhase> = lse;

const session: Session<ExchangePhase> | null = status.currentSession;
const interval: Interval | null = session;

const venueOptions: VenueOptions = { strict: false };
const lenient: Market = defineMarket(XLON_CALENDAR, venueOptions);
const covered: boolean = lse.covers(isoDate);
const dayStart: Date | null = schedule.dayStart;
const dayEnd: Date | null = schedule.dayEnd;

const sessionTemplate: SessionTemplate = {
  phase: 'open',
  start: '09:30',
  end: '16:00',
};

const definition: VenueData<'exchange'> = {
  id: 'XNYS',
  type: 'exchange',
  name: 'New York Stock Exchange',
  timeZone: 'America/New_York',
  weekend: [0, 6],
  sessions: [sessionTemplate],
  coverage: { from: '2026-01-01', through: '2026-12-31' },
  sources: [],
  holidays: [{ date: '2026-07-03', name: 'Independence Day (observed)' }],
  earlyCloses: [
    {
      date: '2026-11-27',
      sessions: [{ phase: 'open', start: '09:30', end: '13:00' }],
    },
  ],
};

const custom: Market = defineMarket(definition);
const serviceDefinition: VenueData<'news-service'> = {
  ...definition,
  id: 'WIRE',
  type: 'news-service',
  sessions: [{ phase: 'open', start: '07:00', end: '19:00' }],
  earlyCloses: [],
};
const customService: Service = defineService(serviceDefinition);

const parts: ZonedParts = toZonedParts(anInstant, 'Europe/London');
const partsInput: ZonedPartsInput = {
  year: 2026,
  month: 7,
  day: 15,
  hour: 11,
};
const disambiguation: Disambiguation = 'reject';
const back: Date = fromZonedParts(partsInput, 'Europe/London', {
  disambiguation: disambiguation,
});
const offset: number = getTimeZoneOffsetMs('Europe/London', anInstant);
const support: TimeZoneSupport = getTimeZoneSupport('Europe/London');
const epochMs: number = toEpochMs('2026-12-24T09:00:00Z');

let code: ErrorCode = 'CALENDAR_HORIZON';
try {
  lse.isOpen('2099-01-01T00:00:00Z');
} catch (error) {
  if (isMarketHoursError(error)) {
    const typed: MarketHoursError = error;
    code = typed.code;
  }
}

console.log(
  open,
  inSession,
  tradingDay,
  describe(status.phase),
  schedule.sessions.length,
  transition.to,
  nextOpen,
  nextClose,
  sources.length,
  anyPhase,
  venueType,
  asVenue.id,
  interval,
  lenient.id,
  shippedCalendar.id,
  covered,
  dayStart,
  dayEnd,
  custom.id,
  customService.id,
  parts.hour,
  back,
  offset,
  support.supported,
  epochMs,
  code,
  instants.length,
  dates.length,
);
