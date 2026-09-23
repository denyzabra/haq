import { createHash, timingSafeEqual } from "node:crypto";

export const TOOL_SECRET_HEADER = "x-haq-tool-secret";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// True only when HAQ_TOOL_SECRET is set and the header matches it.
// Both sides are hashed first so the comparison is constant time for any length.
export function isAuthorizedToolCall(request: Request, secret = process.env.HAQ_TOOL_SECRET): boolean {
  const provided = request.headers.get(TOOL_SECRET_HEADER);
  if (!secret || !provided) return false;
  return timingSafeEqual(digest(provided), digest(secret));
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
