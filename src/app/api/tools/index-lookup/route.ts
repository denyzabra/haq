import { z } from "zod";
import { Decree43InputError } from "@/lib/decree43";
import { recordFlows } from "@/lib/flows";
import { badRequest, parseJsonBody } from "@/lib/http";
import { intakeSchema, runRentCheck } from "@/lib/rent-check";
import { getStore } from "@/lib/store";
import { isAuthorizedToolCall, unauthorized } from "@/lib/tool-auth";

const lookupSchema = intakeSchema.extend({ conversation_id: z.string().optional() });

// ElevenLabs server tool `index_lookup`. Deterministic Decree 43 tier from the mock index.
export async function POST(request: Request) {
  if (!isAuthorizedToolCall(request)) return unauthorized();

  const parsed = await parseJsonBody(request, lookupSchema);
  if ("response" in parsed) return parsed.response;
  const { conversation_id, ...intake } = parsed.data;

  try {
    const result = runRentCheck(intake);
    // index_lookup exists only in the Rule node, so a call proves flow 3 (Router to Rule) and is flow 4.
    await recordFlows(getStore(), conversation_id, [3, 4]);
    return Response.json(result);
  } catch (error) {
    if (error instanceof Decree43InputError) return badRequest(error.message);
    throw error;
  }
}
