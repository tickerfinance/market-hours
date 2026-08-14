// GENERATED FILE - do not edit.
// Source: data/exchanges/XLON.json
//         data/jurisdictions/england-and-wales.json
// Regenerate with: npm run build:calendars

import { defineMarket } from '../../core/define.js';
import type { Market } from '../../types.js';
import type { VenueData } from '../data.js';
import {
  ENGLAND_AND_WALES_HOLIDAYS,
  ENGLAND_AND_WALES_SOURCES,
} from '../jurisdictions/england-and-wales.generated.js';

/**
 * The London Stock Exchange calendar as data, for {@link defineMarket} when you
 * need to change something — extend the coverage horizon, turn strict off, or
 * correct a date without waiting for a release.
 */
export const XLON_CALENDAR: VenueData<'exchange'> = {"id":"XLON","type":"exchange","name":"London Stock Exchange","timeZone":"Europe/London","weekend":[0,6],"sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"16:30"},{"phase":"closing-auction","start":"16:30","end":"16:35"}],"coverage":{"from":"2019-01-01","through":"2028-12-31"},"earlyCloses":[{"date":"2019-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2019-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2020-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2020-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2021-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2021-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2024-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2024-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2025-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2025-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2026-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2026-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2027-12-24","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]},{"date":"2027-12-31","sessions":[{"phase":"pre-open-auction","start":"07:50","end":"08:00"},{"phase":"open","start":"08:00","end":"12:30"},{"phase":"closing-auction","start":"12:30","end":"12:35"}]}],"sources":[...ENGLAND_AND_WALES_SOURCES,...[]],"holidays":ENGLAND_AND_WALES_HOLIDAYS};

/**
 * London Stock Exchange, ready to query. Importing it is the whole setup.
 *
 * ```ts
 * import { XLON } from 'market-hours/xlon';
 * XLON.isOpen();
 * ```
 *
 * One instance for the whole process, so every caller shares its day-schedule
 * cache. Reach for {@link defineMarket} and
 * {@link XLON_CALENDAR} only when you need to change how it behaves.
 */
export const XLON: Market = /*#__PURE__*/ defineMarket(XLON_CALENDAR);
