import { z } from "zod";
import { Decree43InputError } from "@/lib/decree43";
import { recordFlows } from "@/lib/flows";
import { badRequest, newReference, parseJsonBody } from "@/lib/http";
import { intakeSchema, runRentCheck, type RentCheck } from "@/lib/rent-check";
import { getStore, KEYS } from "@/lib/store";
import { isAuthorizedToolCall, unauthorized } from "@/lib/tool-auth";

const draftSchema = intakeSchema.extend({
  proposed_rent_aed: z.coerce.number().positive().finite().optional(),
  conversation_id: z.string().optional(),
});

const aed = (n: number) => `AED ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// Plain summary built only from computed facts. It names the clause but does not quote or paraphrase law.
function buildSummary(check: RentCheck, proposedRent?: number): string {
  const lines = ["Draft objection summary. Not sent and not filed anywhere."];
  if (check.outcome === "checked") {
    lines.push(
      `Area: ${check.area}. Unit type: ${check.unit_type}.`,
      `Current annual rent: ${aed(check.current_rent_aed)}.`,
      `Index average (${check.data_source}): ${aed(check.index_average_aed)}.`,
      `Current rent is ${check.percent_below_average} percent below the index average.`,
    );
    if (!check.band_boundary) {
      lines.push(
        `Maximum increase under ${check.clause}: ${check.max_increase_percent} percent, a maximum new rent of ${aed(check.max_new_rent_aed)}.`,
      );
      if (proposedRent !== undefined) {
        lines.push(
          proposedRent > check.max_new_rent_aed
            ? `Proposed rent of ${aed(proposedRent)} is above that maximum by ${aed(Math.round((proposedRent - check.max_new_rent_aed) * 100) / 100)}.`
            : `Proposed rent of ${aed(proposedRent)} is within that maximum.`,
        );
      }
    } else {
      lines.push(
        `This figure sits between two bands in the official English text of ${check.clause}. The two candidate caps are ${check.lower_cap_percent} percent (maximum new rent ${aed(check.lower_max_new_rent_aed)}) and ${check.upper_cap_percent} percent (maximum new rent ${aed(check.upper_max_new_rent_aed)}). The Arabic text of the Decree prevails.`,
      );
      if (proposedRent !== undefined) {
        lines.push(
          proposedRent > check.upper_max_new_rent_aed
            ? `Proposed rent of ${aed(proposedRent)} is above both candidate maximums.`
            : proposedRent <= check.lower_max_new_rent_aed
              ? `Proposed rent of ${aed(proposedRent)} is within both candidate maximums.`
              : `Proposed rent of ${aed(proposedRent)} is between the two candidate maximums.`,
        );
      }
    }
  } else {
    lines.push("The index average for this area and unit type could not be verified, so no cap was calculated.");
  }
  if (check.notice) {
    lines.push(
      check.notice.notice_late
        ? `Notice of the change was received ${check.notice.days_before_expiry} days before the contract end date, less than the ${check.notice.minimum_notice_days} days required (${check.notice.clause}).`
        : `Notice of the change was received ${check.notice.days_before_expiry} days before the contract end date, meeting the ${check.notice.minimum_notice_days} day minimum (${check.notice.clause}).`,
    );
  }
  lines.push("This is information, not legal advice.");
  return lines.join("\n");
}

// ElevenLabs server tool `prepare_draft`. Stores a draft only. It never sends or files anything.
export async function POST(request: Request) {
  if (!isAuthorizedToolCall(request)) return unauthorized();

  const parsed = await parseJsonBody(request, draftSchema);
  if ("response" in parsed) return parsed.response;
  const { proposed_rent_aed, conversation_id, ...intake } = parsed.data;

  let check: RentCheck;
  try {
    check = runRentCheck(intake);
  } catch (error) {
    if (error instanceof Decree43InputError) return badRequest(error.message);
    throw error;
  }

  const draft = {
    case_reference: newReference("D"),
    created_at: new Date().toISOString(),
    conversation_id,
    summary: buildSummary(check, proposed_rent_aed),
    check,
    sent: false,
  };
  await getStore().rpush(KEYS.drafts, JSON.stringify(draft));
  // prepare_draft exists only in the Paperwork node, so a call proves flow 6 (Rule to Paperwork) and is flow 7.
  await recordFlows(getStore(), conversation_id, [6, 7]);

  return Response.json({
    case_reference: draft.case_reference,
    summary: draft.summary,
    outcome: check.outcome,
    sent: false,
    note: "The draft is saved for the caller only. HAQ has not sent or filed it anywhere.",
  });
}
