import type { RentCheck } from "./rent-check";

// Draft objection summary for the caller's own use, built only from computed
// facts and DLD's own wording. It names the clause but does not quote or
// paraphrase law. The derived index average is not shown (it is UNVERIFIED).

export type DraftLanguage = "en" | "ar";

// Whole fils, so the difference is exact.
const filsDiff = (a: number, b: number) => (Math.round(a * 100) - Math.round(b * 100)) / 100;

const aed = (n: number) => `AED ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function englishSummary(check: RentCheck, proposedRent?: number): string[] {
  const lines = ["Draft objection summary. Not sent and not filed anywhere."];
  if (check.outcome === "checked") {
    lines.push(
      `Area: ${check.area}. Building: ${check.building}. Bedrooms: ${check.bedrooms}.`,
      `Current annual rent: ${aed(check.current_rent_aed)}.`,
      `${check.data_source}: ${aed(check.range_min_aed)} to ${aed(check.range_max_aed)} for this building and bedroom type.`,
      `DLD's rule for this case: ${check.dld_band_text_en}`,
      `Maximum increase under ${check.clause}: ${check.max_increase_percent} percent (${aed(check.max_increase_aed)}), a maximum new rent of ${aed(check.max_new_rent_aed)}.`,
    );
    if (proposedRent !== undefined) {
      lines.push(
        proposedRent > check.max_new_rent_aed
          ? `Proposed rent of ${aed(proposedRent)} is above that maximum by ${aed(filsDiff(proposedRent, check.max_new_rent_aed))}.`
          : `Proposed rent of ${aed(proposedRent)} is within that maximum.`,
      );
    }
  } else {
    lines.push("No DLD Rental Index figure is held for this building and bedroom type, so no cap was calculated.");
  }
  if (check.notice) {
    lines.push(
      check.notice.notice_late
        ? `Notice of the change was received ${check.notice.days_before_expiry} days before the contract end date, less than the ${check.notice.minimum_notice_days} days required (${check.notice.clause}).`
        : `Notice of the change was received ${check.notice.days_before_expiry} days before the contract end date, meeting the ${check.notice.minimum_notice_days} day minimum (${check.notice.clause}).`,
    );
  }
  lines.push("This is information, not legal advice.");
  return lines;
}

// Numbers are written as plain digits, as DLD's Arabic page does ("81000").
const dirham = (n: number) => `${n} درهم`; // UNVERIFIED: HAQ's own Arabic

// Every Arabic template sentence below is HAQ's own wording and UNVERIFIED until
// a native speaker reviews it. The names (area_ar, building_ar, bedrooms_ar) and
// dld_band_text_ar are DLD's official Arabic strings.
function arabicSummary(check: RentCheck, proposedRent?: number): string[] {
  const lines = ["مسودة ملخص اعتراض. لم تُرسل ولم تُقدَّم إلى أي جهة."]; // UNVERIFIED
  if (check.outcome === "checked") {
    lines.push(
      `المنطقة: ${check.area_ar}. البناية: ${check.building_ar ?? check.building}. الغرف: ${check.bedrooms_ar}.`, // UNVERIFIED
      `الإيجار السنوي الحالي: ${dirham(check.current_rent_aed)}.`, // UNVERIFIED
      `مؤشر الإيجارات لهذه البناية ونوع الوحدة: من ${check.range_min_aed} إلى ${check.range_max_aed} درهم في السنة.`, // UNVERIFIED
      `القاعدة كما تذكرها دائرة الأراضي والأملاك: ${check.dld_band_text_ar}`, // UNVERIFIED lead-in; the quote is DLD's
      `الحد الأقصى للزيادة: ${check.max_increase_percent}% (${dirham(check.max_increase_aed)})، والحد الأقصى للإيجار الجديد: ${dirham(check.max_new_rent_aed)}.`, // UNVERIFIED
    );
    if (proposedRent !== undefined) {
      lines.push(
        proposedRent > check.max_new_rent_aed
          ? `الإيجار المقترح ${dirham(proposedRent)} أعلى من هذا الحد بمقدار ${dirham(filsDiff(proposedRent, check.max_new_rent_aed))}.` // UNVERIFIED
          : `الإيجار المقترح ${dirham(proposedRent)} ضمن هذا الحد.`, // UNVERIFIED
      );
    }
  } else {
    lines.push("لا يتوفر رقم من مؤشر الإيجارات لهذه البناية ونوع الوحدة، لذلك لم يُحسب حد للزيادة."); // UNVERIFIED
  }
  if (check.notice) {
    // UNVERIFIED: no Arabic source text for the notice article is held in kb/, so the clause is cited in English.
    lines.push(
      check.notice.notice_late
        ? `وصل إشعار التغيير قبل ${check.notice.days_before_expiry} يوماً من تاريخ انتهاء العقد، وهذا أقل من ${check.notice.minimum_notice_days} يوماً (${check.notice.clause}).`
        : `وصل إشعار التغيير قبل ${check.notice.days_before_expiry} يوماً من تاريخ انتهاء العقد، وهذا يستوفي الحد الأدنى البالغ ${check.notice.minimum_notice_days} يوماً (${check.notice.clause}).`,
    );
  }
  lines.push("هذه معلومات وليست استشارة قانونية."); // UNVERIFIED
  return lines;
}

export function buildSummary(check: RentCheck, language: DraftLanguage, proposedRent?: number): string {
  return (language === "ar" ? arabicSummary(check, proposedRent) : englishSummary(check, proposedRent)).join("\n");
}

export const DRAFT_NOTE: Record<DraftLanguage, string> = {
  en: "The draft is saved for the caller only. HAQ has not sent or filed it anywhere.",
  ar: "المسودة محفوظة لك فقط. لم يرسلها HAQ ولم يقدّمها إلى أي جهة.", // UNVERIFIED
};
