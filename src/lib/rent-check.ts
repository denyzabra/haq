import { z } from "zod";
import { checkNotice, computeIncreaseCap, type NoticeCheckResult } from "./decree43";
import { lookupIndex } from "./mock-index";

// The LLM may send an empty string for a date the caller did not give; treat it as absent.
const calendarDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").optional(),
);

export const intakeSchema = z.object({
  area: z.string().trim().min(1),
  unit_type: z.string().trim().min(1),
  current_rent_aed: z.coerce.number().positive().finite(),
  renewal_date: calendarDate,
  notice_received_date: calendarDate,
});

export type Intake = z.infer<typeof intakeSchema>;

export type RentCheck =
  | {
      outcome: "checked";
      area: string;
      unit_type: string;
      current_rent_aed: number;
      index_average_aed: number;
      percent_below_average: number;
      max_increase_percent: number;
      max_new_rent_aed: number;
      clause: string;
      data_source: string;
      notice?: NoticeCheckResult;
    }
  | {
      outcome: "cannot_verify";
      reason: string;
      data_source: string;
      notice?: NoticeCheckResult;
    };

// Throws Decree43InputError for impossible calendar dates; callers map it to 400.
export function runRentCheck(input: Intake): RentCheck {
  const notice =
    input.renewal_date && input.notice_received_date
      ? checkNotice({ renewalDate: input.renewal_date, noticeReceivedDate: input.notice_received_date })
      : undefined;

  const found = lookupIndex(input.area, input.unit_type);
  if (!found.found) {
    return { outcome: "cannot_verify", reason: found.reason, data_source: found.data_source, ...(notice && { notice }) };
  }

  const cap = computeIncreaseCap({
    indexAverageAed: found.entry.index_average_aed,
    currentRentAed: input.current_rent_aed,
  });
  return {
    outcome: "checked",
    area: found.entry.area_label,
    unit_type: found.entry.unit_label,
    current_rent_aed: input.current_rent_aed,
    ...cap,
    data_source: found.data_source,
    ...(notice && { notice }),
  };
}
