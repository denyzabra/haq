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

interface CapResultBase {
  index_average_aed: number;
  percent_below_average: number;
  clause: string;
}

// The official English text of Article 1 uses whole number bands (up to 10,
// 11 to 20, 21 to 30, 31 to 40, more than 40). A value strictly inside a gap
// (for example 10.5) is not assigned to either band, so HAQ reports both
// candidate caps instead of choosing one. The Arabic text prevails.
export type IncreaseCapResult =
  | (CapResultBase & {
      band_boundary: false;
      max_increase_percent: CapPercent;
      max_new_rent_aed: number;
    })
  | (CapResultBase & {
      band_boundary: true;
      max_increase_percent: null;
      max_new_rent_aed: null;
      lower_cap_percent: CapPercent;
      lower_max_new_rent_aed: number;
      upper_cap_percent: CapPercent;
      upper_max_new_rent_aed: number;
    });

// Upper bound (inclusive) of each band, in percent below the index average.
const BANDS: ReadonlyArray<{ upTo: number; cap: CapPercent; next: CapPercent }> = [
  { upTo: 10, cap: 0, next: 5 },
  { upTo: 20, cap: 5, next: 10 },
  { upTo: 30, cap: 10, next: 15 },
  { upTo: 40, cap: 15, next: 20 },
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
  const maxNewRent = (cap: CapPercent) => Math.floor((rentFils * (100 + cap)) / 100) / 100;

  // Compare in integer fils with cross multiplication so band edges are exact:
  // percent_below <= upTo  <=>  (index - rent) * 100 <= upTo * index
  const scaledBelow = (indexFils - rentFils) * 100;
  const base: CapResultBase = {
    index_average_aed: indexFils / 100,
    percent_below_average: Math.round(((indexFils - rentFils) / indexFils) * 10000) / 100,
    clause: DECREE_43_CLAUSE,
  };

  for (const band of BANDS) {
    if (scaledBelow <= band.upTo * indexFils) {
      return { ...base, band_boundary: false, max_increase_percent: band.cap, max_new_rent_aed: maxNewRent(band.cap) };
    }
    // Strictly between upTo and upTo + 1: a gap in the official bands.
    if (scaledBelow < (band.upTo + 1) * indexFils) {
      return {
        ...base,
        band_boundary: true,
        max_increase_percent: null,
        max_new_rent_aed: null,
        lower_cap_percent: band.cap,
        lower_max_new_rent_aed: maxNewRent(band.cap),
        upper_cap_percent: band.next,
        upper_max_new_rent_aed: maxNewRent(band.next),
      };
    }
  }
  return { ...base, band_boundary: false, max_increase_percent: 20, max_new_rent_aed: maxNewRent(20) };
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
