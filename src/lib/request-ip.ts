import "server-only";
import { createHash } from "node:crypto";

// Vercel sets x-forwarded-for; the first entry is the client address.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

// Rate limit keys store a hash, never the raw address.
export function hashIp(ip: string): string {
  return createHash("sha256").update(`haq-rate-limit:${ip}`).digest("hex").slice(0, 32);
}
