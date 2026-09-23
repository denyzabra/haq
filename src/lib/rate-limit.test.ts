import { describe, expect, it } from "vitest";
import {
  consumeSessionAllowance,
  consumeStaffLoginAttempt,
  DEFAULT_DAILY_SESSION_CAP,
  DEFAULT_IP_HOURLY_CAP,
  sessionCaps,
  STAFF_LOGIN_ATTEMPTS,
} from "./rate-limit";
import { createStore } from "./store";

const T0 = Date.UTC(2026, 8, 23, 10, 15, 0);

describe("sessionCaps", () => {
  it("defaults to 3 per IP per hour and 5 per day", () => {
    expect(sessionCaps({})).toEqual({ ipHourly: 3, daily: 5 });
    expect(DEFAULT_IP_HOURLY_CAP).toBe(3);
    expect(DEFAULT_DAILY_SESSION_CAP).toBe(5);
  });

  it("reads the env vars and ignores invalid values", () => {
    expect(sessionCaps({ HAQ_IP_HOURLY_CAP: "10", HAQ_DAILY_SESSION_CAP: "40" })).toEqual({ ipHourly: 10, daily: 40 });
    expect(sessionCaps({ HAQ_IP_HOURLY_CAP: "abc", HAQ_DAILY_SESSION_CAP: "-2" })).toEqual({ ipHourly: 3, daily: 5 });
  });
});

describe("consumeSessionAllowance", () => {
  it("allows 3 sessions per IP per hour, then limits that IP until the next hour", async () => {
    let now = T0;
    const store = createStore({}, () => now);
    const caps = { ipHourly: 3, daily: 100 };
    for (let i = 0; i < 3; i++) expect(await consumeSessionAllowance(store, "ipA", caps, now)).toEqual({ ok: true });
    expect(await consumeSessionAllowance(store, "ipA", caps, now)).toEqual({
      ok: false,
      limited: "ip",
      retry_after_seconds: 45 * 60,
    });
    // A different IP is unaffected.
    expect(await consumeSessionAllowance(store, "ipB", caps, now)).toEqual({ ok: true });
    now = T0 + 46 * 60 * 1000;
    expect(await consumeSessionAllowance(store, "ipA", caps, now)).toEqual({ ok: true });
  });

  it("enforces the global daily cap across IPs until the next UTC day", async () => {
    let now = T0;
    const store = createStore({}, () => now);
    const caps = { ipHourly: 3, daily: 5 };
    for (const ip of ["a", "b", "c", "d", "e"]) expect((await consumeSessionAllowance(store, ip, caps, now)).ok).toBe(true);
    const limited = await consumeSessionAllowance(store, "f", caps, now);
    expect(limited).toMatchObject({ ok: false, limited: "daily" });
    now = Date.UTC(2026, 8, 24, 0, 0, 1);
    expect((await consumeSessionAllowance(store, "f", caps, now)).ok).toBe(true);
  });

  it("does not use the daily allowance for a caller already over their own limit", async () => {
    const store = createStore({}, () => T0);
    const caps = { ipHourly: 1, daily: 2 };
    expect((await consumeSessionAllowance(store, "a", caps, T0)).ok).toBe(true);
    expect(await consumeSessionAllowance(store, "a", caps, T0)).toMatchObject({ limited: "ip" });
    expect(await consumeSessionAllowance(store, "a", caps, T0)).toMatchObject({ limited: "ip" });
    expect((await consumeSessionAllowance(store, "b", caps, T0)).ok).toBe(true);
  });

  it("treats a cap of 0 as closed", async () => {
    const store = createStore({}, () => T0);
    expect(await consumeSessionAllowance(store, "a", { ipHourly: 3, daily: 0 }, T0)).toMatchObject({ limited: "daily" });
  });
});

describe("consumeStaffLoginAttempt", () => {
  it(`allows ${STAFF_LOGIN_ATTEMPTS} attempts per 15 minutes`, async () => {
    const store = createStore({}, () => T0);
    for (let i = 0; i < STAFF_LOGIN_ATTEMPTS; i++) expect(await consumeStaffLoginAttempt(store, "ip", T0)).toBe(true);
    expect(await consumeStaffLoginAttempt(store, "ip", T0)).toBe(false);
  });
});
