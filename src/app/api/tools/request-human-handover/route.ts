import { z } from "zod";
import { recordFlows } from "@/lib/flows";
import { newReference, parseJsonBody } from "@/lib/http";
import { getStore, KEYS } from "@/lib/store";
import { isAuthorizedToolCall, unauthorized } from "@/lib/tool-auth";

const handoverSchema = z.object({
  reason: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  conversation_id: z.string().optional(),
  language: z.string().optional(),
  callback_consent: z.boolean().optional(),
});

// ElevenLabs server tool `request_human_handover`. In the browser demo this replaces
// transfer_to_number, which only works on phone calls (spec section 3).
export async function POST(request: Request) {
  if (!isAuthorizedToolCall(request)) return unauthorized();

  const parsed = await parseJsonBody(request, handoverSchema);
  if ("response" in parsed) return parsed.response;

  const entry = {
    reference: newReference("H"),
    created_at: new Date().toISOString(),
    status: "open",
    ...parsed.data,
  };
  await getStore().rpush(KEYS.handovers, JSON.stringify(entry));
  await recordFlows(getStore(), parsed.data.conversation_id, [8]);

  return Response.json({
    reference: entry.reference,
    callback_message: `A person from the HAQ team will call you back. Your reference is ${entry.reference}.`,
  });
}
