import { randomBytes } from "node:crypto";
import type { z } from "zod";

export function badRequest(error: string, details?: unknown): Response {
  return Response.json({ error, ...(details ? { details } : {}) }, { status: 400 });
}

// Parses a JSON body against a schema. Returns the data or a 400 response.
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: badRequest("body must be valid JSON") };
  }
  // ElevenLabs may send tool arguments at the top level or wrapped in `parameters`.
  const params =
    body && typeof body === "object" && "parameters" in body && typeof body.parameters === "object"
      ? body.parameters
      : body;
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return {
      response: badRequest(
        "invalid input",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      ),
    };
  }
  return { data: parsed.data };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Short human readable reference, for example HAQ-D-7KQ2M9XA.
export function newReference(prefix: "D" | "H"): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `HAQ-${prefix}-${code}`;
}
