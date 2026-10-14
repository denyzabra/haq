import { z } from "zod";
import { Decree43InputError } from "@/lib/decree43";
import { recordFlows } from "@/lib/flows";
import { badRequest, newReference, parseJsonBody } from "@/lib/http";
import { buildSummary, DRAFT_NOTE } from "@/lib/draft-summary";
import { amountAed, intakeSchema, runRentCheck, type RentCheck } from "@/lib/rent-check";
import { getStore, KEYS } from "@/lib/store";
import { isAuthorizedToolCall, unauthorized } from "@/lib/tool-auth";

const draftSchema = intakeSchema.extend({
  proposed_rent_aed: amountAed.optional(),
  language: z.enum(["en", "ar"]).default("en"),
  conversation_id: z.string().optional(),
});

// ElevenLabs server tool `prepare_draft`. Stores a draft only. It never sends or files anything.
export async function POST(request: Request) {
  if (!isAuthorizedToolCall(request)) return unauthorized();

  const parsed = await parseJsonBody(request, draftSchema);
  if ("response" in parsed) return parsed.response;
  const { proposed_rent_aed, language, conversation_id, ...intake } = parsed.data;

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
    language,
    summary: buildSummary(check, language, proposed_rent_aed),
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
    note: DRAFT_NOTE[language],
  });
}
