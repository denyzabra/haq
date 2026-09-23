import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const STAFF_COOKIE = "haq_staff";
export const STAFF_SESSION_SECONDS = 8 * 60 * 60;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function checkStaffPassword(input: string, password = process.env.STAFF_PASSWORD): boolean {
  if (!password || !input) return false;
  return safeEqual(input, password);
}

// The signing key is derived from STAFF_PASSWORD, so changing the password
// signs every existing staff session out.
function sign(expiresAt: number, password: string): string {
  const key = createHash("sha256").update(`haq-staff-session:${password}`).digest();
  return createHmac("sha256", key).update(String(expiresAt)).digest("hex");
}

export function createStaffSession(now = Date.now(), password = process.env.STAFF_PASSWORD): string {
  if (!password) throw new Error("STAFF_PASSWORD is not set");
  const expiresAt = Math.floor(now / 1000) + STAFF_SESSION_SECONDS;
  return `${expiresAt}.${sign(expiresAt, password)}`;
}

export function isValidStaffSession(
  value: string | undefined,
  now = Date.now(),
  password = process.env.STAFF_PASSWORD,
): boolean {
  if (!value || !password) return false;
  const [expiresRaw, signature] = value.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || !signature) return false;
  if (expiresAt <= Math.floor(now / 1000)) return false;
  return safeEqual(signature, sign(expiresAt, password));
}
