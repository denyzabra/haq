import { z } from "zod";
import { normalizeAmount } from "./arabic";
import { checkNotice, computeIncreaseCap, type IncreaseCapResult, type NoticeCheckResult } from "./decree43";
import { bandText, lookupIndex, type IndexLookupFailure } from "./mock-index";

// The LLM may send an empty string for a date the caller did not give; treat it as absent.
const calendarDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").optional(),
);

// Accepts a number, or text with Arabic-Indic or Persian digits and an Arabic
// thousands separator or comma between digits, for example "٧٥٬٠٠٠".
export const amountAed = z.preprocess(normalizeAmount, z.coerce.number().positive().finite());

export const intakeSchema = z.object({
  area: z.string().trim().min(1),
  building: z.string().trim().min(1),
  bedrooms: z.string().trim().min(1),
  current_rent_aed: amountAed,
  renewal_date: calendarDate,
  notice_received_date: calendarDate,
});

export type Intake = z.infer<typeof intakeSchema>;

export type RentCheck =
  | ({
      outcome: "checked";
      area: string;
      area_ar: string;
      building: string;
      building_ar: string | null;
      bedrooms: string;
      bedrooms_ar: string;
      current_rent_aed: number;
      range_min_aed: number;
      range_max_aed: number;
      dld_band_text_en: string;
      dld_band_text_ar: string;
      data_source: string;
      notice?: NoticeCheckResult;
    } & IncreaseCapResult)
  | {
      outcome: "cannot_verify";
      reason: IndexLookupFailure;
      data_source: string;
      notice?: NoticeCheckResult;
    };

// Throws Decree43InputError for impossible calendar dates; callers map it to 400.
export function runRentCheck(input: Intake): RentCheck {
  const notice =
    input.renewal_date && input.notice_received_date
      ? checkNotice({ renewalDate: input.renewal_date, noticeReceivedDate: input.notice_received_date })
      : undefined;

  const found = lookupIndex(input.area, input.building, input.bedrooms);
  if (!found.found) {
    return { outcome: "cannot_verify", reason: found.reason, data_source: found.data_source, ...(notice && { notice }) };
  }

  const { entry } = found;
  const cap = computeIncreaseCap({
    indexAverageAed: found.index_average_aed,
    currentRentAed: input.current_rent_aed,
  });
  const band = bandText(cap.max_increase_percent);
  return {
    outcome: "checked",
    area: entry.area,
    area_ar: entry.area_ar,
    building: entry.building,
    building_ar: entry.building_ar,
    bedrooms: entry.bedrooms,
    bedrooms_ar: entry.bedrooms_ar,
    current_rent_aed: input.current_rent_aed,
    range_min_aed: entry.range_min_aed,
    range_max_aed: entry.range_max_aed,
    ...cap,
    dld_band_text_en: band.en,
    dld_band_text_ar: band.ar,
    data_source: found.data_source,
    ...(notice && { notice }),
  };
}
