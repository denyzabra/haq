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

export interface IncreaseCapResult {
  index_average_aed: number;
  percent_below_average: number;
  max_increase_percent: 0 | 5 | 10 | 15 | 20;
  max_new_rent_aed: number;
  clause: string;
}

// Upper bound (inclusive) of each band, in percent below the index average.
const BANDS: ReadonlyArray<{ upTo: number; cap: IncreaseCapResult["max_increase_percent"] }> = [
  { upTo: 10, cap: 0 },
  { upTo: 20, cap: 5 },
  { upTo: 30, cap: 10 },
  { upTo: 40, cap: 15 },
];

function toFils(aed: number, field: string): number {
  if (typeof aed !== "number" || !Number.isFinite(aed) || aed <= 0) {
    throw new Decree43InputError(`${field} must be a positive number`);
  }
  return Math.round(aed * 100);
}

export function computeIncreaseCap({
  indexAverageAed,
  currentRentAed,
}: IncreaseCapInput): IncreaseCapResult {
  const indexFils = toFils(indexAverageAed, "index_average_aed");
  const rentFils = toFils(currentRentAed, "current_rent_aed");

  // Compare in integer fils with cross multiplication so band edges are exact:
  // percent_below <= upTo  <=>  (index - rent) * 100 <= upTo * index
  const belowFils = indexFils - rentFils;
  let cap: IncreaseCapResult["max_increase_percent"] = 20;
  for (const band of BANDS) {
    if (belowFils * 100 <= band.upTo * indexFils) {
      cap = band.cap;
      break;
    }
  }

  const maxNewRentFils = Math.floor((rentFils * (100 + cap)) / 100);

  return {
    index_average_aed: indexFils / 100,
    percent_below_average: Math.round((belowFils / indexFils) * 10000) / 100,
    max_increase_percent: cap,
    max_new_rent_aed: maxNewRentFils / 100,
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
