import "server-only";
import { KEYS, type Store } from "./store";

type Env = Record<string, string | undefined>;

export const DEFAULT_IP_HOURLY_CAP = 3;
export const DEFAULT_DAILY_SESSION_CAP = 5;

function readCap(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function sessionCaps(env: Env = process.env) {
  return {
    ipHourly: readCap(env.HAQ_IP_HOURLY_CAP, DEFAULT_IP_HOURLY_CAP),
    daily: readCap(env.HAQ_DAILY_SESSION_CAP, DEFAULT_DAILY_SESSION_CAP),
  };
}

export type LimitResult =
  | { ok: true }
  | { ok: false; limited: "ip" | "daily"; retry_after_seconds: number };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Fixed windows: per IP per clock hour, and a global cap per UTC day.
// The IP window is checked first so a caller who is already over their own
// limit does not use up the shared daily allowance.
export async function consumeSessionAllowance(
  store: Store,
  ipHash: string,
  caps: { ipHourly: number; daily: number },
  now: number = Date.now(),
): Promise<LimitResult> {
  const hour = Math.floor(now / HOUR_MS);
  const ipCount = await store.incrWindow(KEYS.ipHourly(ipHash, hour), 60 * 60);
  if (ipCount > caps.ipHourly) {
    return { ok: false, limited: "ip", retry_after_seconds: Math.ceil(((hour + 1) * HOUR_MS - now) / 1000) };
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const dayCount = await store.incrWindow(KEYS.daily(day), 26 * 60 * 60);
  if (dayCount > caps.daily) {
    const nextDay = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
    return { ok: false, limited: "daily", retry_after_seconds: Math.ceil((nextDay - now) / 1000) };
  }
  return { ok: true };
}

const STAFF_WINDOW_MS = 15 * 60 * 1000;
export const STAFF_LOGIN_ATTEMPTS = 5;

export async function consumeStaffLoginAttempt(store: Store, ipHash: string, now: number = Date.now()) {
  const slot = Math.floor(now / STAFF_WINDOW_MS);
  const count = await store.incrWindow(KEYS.staffLogin(ipHash, slot), 15 * 60);
  return count <= STAFF_LOGIN_ATTEMPTS;
}
