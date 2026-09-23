import { describe, expect, it } from "vitest";
import { checkStaffPassword, createStaffSession, isValidStaffSession, STAFF_SESSION_SECONDS } from "./staff-auth";

const PW = "correct horse battery staple";
const T0 = Date.UTC(2026, 8, 23, 10);

describe("checkStaffPassword", () => {
  it("accepts only the configured password", () => {
    expect(checkStaffPassword(PW, PW)).toBe(true);
    expect(checkStaffPassword("wrong", PW)).toBe(false);
    expect(checkStaffPassword("", PW)).toBe(false);
  });

  it("rejects everything when STAFF_PASSWORD is not set", () => {
    expect(checkStaffPassword("anything", undefined)).toBe(false);
    expect(checkStaffPassword("", "")).toBe(false);
  });
});

describe("staff session cookie", () => {
  it("is valid until it expires", () => {
    const cookie = createStaffSession(T0, PW);
    expect(isValidStaffSession(cookie, T0 + 1000, PW)).toBe(true);
    expect(isValidStaffSession(cookie, T0 + STAFF_SESSION_SECONDS * 1000, PW)).toBe(false);
  });

  it("is rejected after the password changes", () => {
    const cookie = createStaffSession(T0, PW);
    expect(isValidStaffSession(cookie, T0, "a new password")).toBe(false);
  });

  it.each([undefined, "", "abc", "123.", ".abc", "9999999999.deadbeef"])("rejects forged value %j", (value) => {
    expect(isValidStaffSession(value, T0, PW)).toBe(false);
  });

  it("rejects an extended expiry with the old signature", () => {
    const [, sig] = createStaffSession(T0, PW).split(".");
    const forged = `${Math.floor(T0 / 1000) + 10 * STAFF_SESSION_SECONDS}.${sig}`;
    expect(isValidStaffSession(forged, T0, PW)).toBe(false);
  });
});
