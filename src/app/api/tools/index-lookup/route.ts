import { Decree43InputError } from "@/lib/decree43";
import { badRequest, parseJsonBody } from "@/lib/http";
import { intakeSchema, runRentCheck } from "@/lib/rent-check";
import { isAuthorizedToolCall, unauthorized } from "@/lib/tool-auth";

// ElevenLabs server tool `index_lookup`. Deterministic Decree 43 tier from the mock index.
export async function POST(request: Request) {
  if (!isAuthorizedToolCall(request)) return unauthorized();

  const parsed = await parseJsonBody(request, intakeSchema);
  if ("response" in parsed) return parsed.response;

  try {
    return Response.json(runRentCheck(parsed.data));
  } catch (error) {
    if (error instanceof Decree43InputError) return badRequest(error.message);
    throw error;
  }
}
