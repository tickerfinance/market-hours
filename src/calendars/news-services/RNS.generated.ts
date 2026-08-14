// GENERATED FILE - do not edit.
// Source: data/news-services/RNS.json
//         data/jurisdictions/england-and-wales.json
// Regenerate with: npm run build:calendars

import { defineService } from '../../core/define.js';
import type { Service } from '../../types.js';
import type { VenueData } from '../data.js';
import {
  ENGLAND_AND_WALES_HOLIDAYS,
  ENGLAND_AND_WALES_SOURCES,
} from '../jurisdictions/england-and-wales.generated.js';

/**
 * The Regulatory News Service calendar as data, for {@link defineService} when you
 * need to change something — extend the coverage horizon, turn strict off, or
 * correct a date without waiting for a release.
 */
export const RNS_CALENDAR: VenueData<'news-service'> = {"id":"RNS","type":"news-service","name":"Regulatory News Service","timeZone":"Europe/London","weekend":[0,6],"sessions":[{"phase":"open","start":"07:00","end":"19:30"}],"coverage":{"from":"2019-01-01","through":"2028-12-31"},"earlyCloses":[{"date":"2019-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2019-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2020-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2020-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2021-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2021-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2024-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2024-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2025-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2025-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2026-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2026-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2027-12-24","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]},{"date":"2027-12-31","sessions":[{"phase":"open","start":"07:00","end":"13:30"}]}],"sources":[...ENGLAND_AND_WALES_SOURCES,...[]],"holidays":ENGLAND_AND_WALES_HOLIDAYS};

/**
 * Regulatory News Service, ready to query. Importing it is the whole setup.
 *
 * ```ts
 * import { RNS } from 'market-hours/rns';
 * RNS.isOpen();
 * ```
 *
 * One instance for the whole process, so every caller shares its day-schedule
 * cache. Reach for {@link defineService} and
 * {@link RNS_CALENDAR} only when you need to change how it behaves.
 */
export const RNS: Service = /*#__PURE__*/ defineService(RNS_CALENDAR);
