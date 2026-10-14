import { describe, expect, it } from "vitest";
import {
  checkNotice,
  computeIncreaseCap,
  DECREE_43_CLAUSE,
  Decree43InputError,
  parseCalendarDate,
} from "./decree43";

const cap = (currentRentAed: number, indexAverageAed = 100_000) =>
  computeIncreaseCap({ indexAverageAed, currentRentAed });

// Rents against an index average of AED 100,000, so AED 1,000 is one percent.
// The edge cases mirror what the DLD calculator returned on 14 October 2026.
describe("computeIncreaseCap follows the DLD calculator", () => {
  it.each([
    ["above average", 120_000, -20, 0],
    ["exactly at average", 100_000, 0, 0],
    ["exactly 10 percent below", 90_000, 10, 0],
    ["10.5 percent below (an exact .5 rounds down)", 89_500, 10.5, 0],
    ["10.51 percent below", 89_490, 10.51, 5],
    ["10.6 percent below", 89_400, 10.6, 5],
    ["10.9 percent below", 89_100, 10.9, 5],
    ["exactly 11 percent below", 89_000, 11, 5],
    ["exactly 20 percent below", 80_000, 20, 5],
    ["20.5 percent below", 79_500, 20.5, 5],
    ["20.6 percent below", 79_400, 20.6, 10],
    ["exactly 30 percent below", 70_000, 30, 10],
    ["30.5 percent below", 69_500, 30.5, 10],
    ["30.6 percent below", 69_400, 30.6, 15],
    ["exactly 40 percent below", 60_000, 40, 15],
    ["40.5 percent below", 59_500, 40.5, 15],
    ["40.6 percent below", 59_400, 40.6, 20],
    ["40.9 percent below", 59_100, 40.9, 20],
    ["exactly 41 percent below", 59_000, 41, 20],
    ["far below", 10_000, 90, 20],
  ])("%s", (_label, rent, percentBelow, expectedCap) => {
    const result = cap(rent);
    expect(result.percent_below_average).toBe(percentBelow);
    expect(result.max_increase_percent).toBe(expectedCap);
    expect(result.clause).toBe(DECREE_43_CLAUSE);
  });

  it("returns only the documented fields", () => {
    expect(cap(80_000)).toEqual({
      index_average_aed: 100_000,
      percent_below_average: 20,
      max_increase_percent: 5,
      max_increase_aed: 4_000,
      max_new_rent_aed: 84_000,
      clause: DECREE_43_CLAUSE,
    });
  });

  it("is exact where floating point division would drift", () => {
    // 7000 / 70000 * 100 is 10.000000000000002 in floating point.
    expect(cap(63_000, 70_000)).toMatchObject({ percent_below_average: 10, max_increase_percent: 0 });
    // 7350 / 70000 * 100 is exactly 10.5, which rounds down to 10.
    expect(cap(62_650, 70_000)).toMatchObject({ percent_below_average: 10.5, max_increase_percent: 0 });
  });
});

describe("computeIncreaseCap amounts", () => {
  it("does not round the increase, like DLD", () => {
    expect(cap(71_550, 90_000)).toMatchObject({ max_increase_percent: 5, max_increase_aed: 3_577.5, max_new_rent_aed: 75_127.5 });
  });

  it("computes the increase and maximum new rent from the cap", () => {
    expect(cap(59_000)).toMatchObject({ max_increase_aed: 11_800, max_new_rent_aed: 70_800 });
  });

  it("allows no increase at or above the average", () => {
    expect(cap(100_000)).toMatchObject({ max_increase_aed: 0, max_new_rent_aed: 100_000 });
    expect(cap(120_000)).toMatchObject({ max_increase_aed: 0, max_new_rent_aed: 120_000 });
  });

  it("floors a remainder below one fil for a rent with fils", () => {
    const result = computeIncreaseCap({ indexAverageAed: 55_555.55, currentRentAed: 44_444.44 });
    expect(result).toMatchObject({ max_increase_percent: 5, max_increase_aed: 2_222.22, max_new_rent_aed: 46_666.66 });
  });
});

describe("computeIncreaseCap input validation", () => {
  it.each([
    ["zero rent", 0, 100_000],
    ["negative rent", -5_000, 100_000],
    ["zero index", 50_000, 0],
    ["negative index", 50_000, -1],
    ["NaN rent", Number.NaN, 100_000],
    ["infinite index", 50_000, Number.POSITIVE_INFINITY],
    ["an index too large for exact maths", 50_000, 1e13],
  ])("rejects %s", (_label, rent, index) => {
    expect(() => computeIncreaseCap({ indexAverageAed: index, currentRentAed: rent })).toThrow(
      Decree43InputError,
    );
  });
});

describe("checkNotice", () => {
  it("treats exactly 90 days before expiry as on time", () => {
    const result = checkNotice({ renewalDate: "2026-12-31", noticeReceivedDate: "2026-10-02" });
    expect(result.days_before_expiry).toBe(90);
    expect(result.notice_late).toBe(false);
  });

  it("treats 89 days before expiry as late", () => {
    const result = checkNotice({ renewalDate: "2026-12-31", noticeReceivedDate: "2026-10-03" });
    expect(result.days_before_expiry).toBe(89);
    expect(result.notice_late).toBe(true);
  });

  it("is not shifted by a daylight saving change inside the range", () => {
    // Europe and US clocks change in late March and early November.
    expect(
      checkNotice({ renewalDate: "2027-05-30", noticeReceivedDate: "2027-03-01" }).days_before_expiry,
    ).toBe(90);
    expect(
      checkNotice({ renewalDate: "2027-01-29", noticeReceivedDate: "2026-10-31" }).days_before_expiry,
    ).toBe(90);
  });

  it("counts 29 February in a leap year", () => {
    // 2028 is a leap year: 1 Feb to 1 Mar is 29 days.
    expect(
      checkNotice({ renewalDate: "2028-03-01", noticeReceivedDate: "2028-02-01" }).days_before_expiry,
    ).toBe(29);
    expect(
      checkNotice({ renewalDate: "2028-05-01", noticeReceivedDate: "2028-02-01" }).days_before_expiry,
    ).toBe(90);
  });

  it("flags notice received after expiry as late", () => {
    const result = checkNotice({ renewalDate: "2026-06-01", noticeReceivedDate: "2026-06-10" });
    expect(result.days_before_expiry).toBe(-9);
    expect(result.notice_late).toBe(true);
  });

  it.each(["2026-13-01", "2026-02-30", "01/02/2026", "2026-1-5", "", "2026-02-01T00:00:00Z"])(
    "rejects invalid date %j",
    (value) => {
      expect(() => parseCalendarDate(value, "renewal_date")).toThrow(Decree43InputError);
    },
  );
});
