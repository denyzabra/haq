// Deterministic Decree 43 of 2013 (Article 1) rent increase cap and the 90 day
// notice check. The LLM never does this arithmetic; it only reads these results.

export const DECREE_43_CLAUSE = "Decree 43 of 2013, Article 1";

// Article (14) as superseded by Law No. (33) of 2008, Article (1).
// Verified against the Dubai Legislation Portal text on 2026-09-23 (kb/law-26-2007-and-law-33-2008.md).
export const NOTICE_CLAUSE = "Law 26 of 2007 as amended by Law 33 of 2008, Article 14";

export const MIN_NOTICE_DAYS = 90;

export class Decree43InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Decree43InputError";
  }
}

export interface IncreaseCapInput {
  indexAverageAed: number;
  currentRentAed: number;
}

export type CapPercent = 0 | 5 | 10 | 15 | 20;

export interface IncreaseCapResult {
  index_average_aed: number;
  percent_below_average: number;
  max_increase_percent: CapPercent;
  max_increase_aed: number;
  max_new_rent_aed: number;
  clause: string;
}

// HAQ follows the DLD Rental Index calculator. The rule below is inferred from
// DLD calculator outputs on 14 October 2026, not from a published method
// (docs/index-evidence/al-hamriya-al-hamria-3br-boundary-lookups.json and the
// three result PDFs): the percent below the index average is rounded to the
// nearest whole number, an exact .5 rounding down, and the whole number is
// placed in DLD's bands. At or above the average there is no increase.
const BANDS: ReadonlyArray<{ upTo: number; cap: CapPercent }> = [
  { upTo: 10, cap: 0 },
  { upTo: 20, cap: 5 },
  { upTo: 30, cap: 10 },
  { upTo: 40, cap: 15 },
];
const ABOVE_40_CAP: CapPercent = 20;

// All amounts are whole fils (AED x 100) so every step is exact integer maths.
function toFils(aed: number, field: string): number {
  if (typeof aed !== "number" || !Number.isFinite(aed) || aed <= 0) {
    throw new Decree43InputError(`${field} must be a positive number`);
  }
  const fils = Math.round(aed * 100);
  if (!Number.isSafeInteger(fils * 10_000)) throw new Decree43InputError(`${field} is too large`);
  return fils;
}

// Exact floor of a / b for non-negative safe integers; corrects any float rounding.
function divFloor(a: number, b: number): number {
  let q = Math.floor(a / b);
  while (q * b > a) q -= 1;
  while ((q + 1) * b <= a) q += 1;
  return q;
}

// Percent below the average as a whole number, an exact .5 rounding down.
function wholePercentBelow(belowFils: number, indexFils: number): number {
  if (belowFils <= 0) return 0;
  const scaled = belowFils * 100;
  const whole = divFloor(scaled, indexFils);
  const remainder = scaled - whole * indexFils;
  return 2 * remainder <= indexFils ? whole : whole + 1;
}

// Percent below the average to two decimals, for information only (half up).
function percentToTwoDecimals(belowFils: number, indexFils: number): number {
  const scaled = Math.abs(belowFils) * 10_000;
  const hundredths = divFloor(scaled, indexFils);
  const rounded = 2 * (scaled - hundredths * indexFils) >= indexFils ? hundredths + 1 : hundredths;
  return ((belowFils < 0 ? -1 : 1) * rounded) / 100;
}

export function computeIncreaseCap({ indexAverageAed, currentRentAed }: IncreaseCapInput): IncreaseCapResult {
  const indexFils = toFils(indexAverageAed, "index_average_aed");
  const rentFils = toFils(currentRentAed, "current_rent_aed");
  const belowFils = indexFils - rentFils;

  const percent = wholePercentBelow(belowFils, indexFils);
  const cap = BANDS.find((band) => percent <= band.upTo)?.cap ?? ABOVE_40_CAP;
  // DLD does not round the increase (AED 3,577.5 on AED 71,550), and neither do
  // we: it is exact for any rent in whole dirhams. A remainder below one fil, only
  // possible when the rent itself has fils, is floored so the cap is never exceeded.
  const increaseFils = divFloor(rentFils * cap, 100);

  return {
    index_average_aed: indexFils / 100,
    percent_below_average: percentToTwoDecimals(belowFils, indexFils),
    max_increase_percent: cap,
    max_increase_aed: increaseFils / 100,
    max_new_rent_aed: (rentFils + increaseFils) / 100,
    clause: DECREE_43_CLAUSE,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Parses a YYYY-MM-DD calendar date as UTC midnight so no local timezone or
// daylight saving shift can move a day count by one.
export function parseCalendarDate(value: string, field: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Decree43InputError(`${field} must be a date in YYYY-MM-DD format`);
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Decree43InputError(`${field} is not a real calendar date`);
  }
  return ms;
}

export interface NoticeCheckInput {
  renewalDate: string;
  noticeReceivedDate: string;
}

export interface NoticeCheckResult {
  days_before_expiry: number;
  minimum_notice_days: number;
  notice_late: boolean;
  clause: string;
}

export function checkNotice({ renewalDate, noticeReceivedDate }: NoticeCheckInput): NoticeCheckResult {
  const renewal = parseCalendarDate(renewalDate, "renewal_date");
  const notice = parseCalendarDate(noticeReceivedDate, "notice_received_date");
  const days = Math.round((renewal - notice) / DAY_MS);
  return {
    days_before_expiry: days,
    minimum_notice_days: MIN_NOTICE_DAYS,
    notice_late: days < MIN_NOTICE_DAYS,
    clause: NOTICE_CLAUSE,
  };
}
