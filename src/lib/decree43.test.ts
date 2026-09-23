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

describe("computeIncreaseCap single band results", () => {
  it.each([
    ["above average", 120_000, -20, 0],
    ["exactly at average", 100_000, 0, 0],
    ["exactly 10 percent below", 90_000, 10, 0],
    ["exactly 11 percent below", 89_000, 11, 5],
    ["exactly 20 percent below", 80_000, 20, 5],
    ["exactly 21 percent below", 79_000, 21, 10],
    ["exactly 30 percent below", 70_000, 30, 10],
    ["exactly 31 percent below", 69_000, 31, 15],
    ["exactly 40 percent below", 60_000, 40, 15],
    ["exactly 41 percent below", 59_000, 41, 20],
    ["far below", 10_000, 90, 20],
  ])("%s", (_label, rent, percentBelow, expectedCap) => {
    const result = cap(rent);
    expect(result.band_boundary).toBe(false);
    expect(result.percent_below_average).toBe(percentBelow);
    expect(result.max_increase_percent).toBe(expectedCap);
    expect(result.clause).toBe(DECREE_43_CLAUSE);
  });

  it("is exact where floating point division would drift", () => {
    // 7000 / 70000 * 100 is 10.000000000000002 in floating point.
    const result = cap(63_000, 70_000);
    expect(result.band_boundary).toBe(false);
    expect(result.max_increase_percent).toBe(0);
    expect(result.percent_below_average).toBe(10);
  });

  it("computes the maximum new rent from the cap", () => {
    expect(cap(80_000).max_new_rent_aed).toBe(84_000);
    expect(cap(59_000).max_new_rent_aed).toBe(70_800);
    expect(cap(100_000).max_new_rent_aed).toBe(100_000);
  });

  it("handles fractional dirham amounts", () => {
    const result = computeIncreaseCap({ indexAverageAed: 55_555.55, currentRentAed: 44_444.44 });
    expect(result.max_increase_percent).toBe(5);
    expect(result.max_new_rent_aed).toBe(46_666.66);
  });
});

describe("computeIncreaseCap gaps in the official bands", () => {
  it.each([
    ["10.5 percent below", 89_500, 10.5, 0, 89_500, 5, 93_975],
    ["20.5 percent below", 79_500, 20.5, 5, 83_475, 10, 87_450],
    ["30.5 percent below", 69_500, 30.5, 10, 76_450, 15, 79_925],
    ["40.5 percent below", 59_500, 40.5, 15, 68_425, 20, 71_400],
    ["just above 10 percent", 89_990, 10.01, 0, 89_990, 5, 94_489.5],
    ["just below 11 percent", 89_010, 10.99, 0, 89_010, 5, 93_460.5],
  ])("%s reports both candidate caps", (_label, rent, percentBelow, lower, lowerMax, upper, upperMax) => {
    const result = cap(rent);
    expect(result).toEqual({
      index_average_aed: 100_000,
      percent_below_average: percentBelow,
      clause: DECREE_43_CLAUSE,
      band_boundary: true,
      max_increase_percent: null,
      max_new_rent_aed: null,
      lower_cap_percent: lower,
      lower_max_new_rent_aed: lowerMax,
      upper_cap_percent: upper,
      upper_max_new_rent_aed: upperMax,
    });
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
