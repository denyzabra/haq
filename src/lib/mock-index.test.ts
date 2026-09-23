import { describe, expect, it } from "vitest";
import mockIndex from "../../data/mock-index.json";
import { DATA_SOURCE, lookupIndex, resolveArea, resolveUnitType } from "./mock-index";

describe("mock index data", () => {
  it("is labelled as a demo sample, never as official", () => {
    expect(DATA_SOURCE).toBe("demo sample, not official");
  });

  it("has every entry reachable through the alias maps", () => {
    for (const entry of mockIndex.entries) {
      const result = lookupIndex(entry.area_label, entry.unit_label);
      expect(result.found).toBe(true);
    }
  });
});

describe("area aliases", () => {
  it.each([
    ["Jumeirah Village Circle", "jvc"],
    ["JVC", "jvc"],
    ["jvc", "jvc"],
    ["  jumeirah   village  circle ", "jvc"],
    ["قرية جميرا الدائرية", "jvc"],
    ["Dubai Marina", "dubai_marina"],
    ["DUBAI MARINA", "dubai_marina"],
    ["dubaimarina", "dubai_marina"],
    ["دبي مارينا", "dubai_marina"],
    ["Deira", "deira"],
    ["ديرة", "deira"],
    ["Al Barsha", "al_barsha"],
    ["al-barsha", "al_barsha"],
    ["البرشاء", "al_barsha"],
  ])("%j resolves to %s", (input, expected) => {
    expect(resolveArea(input)).toBe(expected);
  });

  it("returns undefined for an unknown area", () => {
    expect(resolveArea("Palm Jumeirah")).toBeUndefined();
  });
});

describe("unit type aliases", () => {
  it.each([
    ["studio", "studio"],
    ["Studio", "studio"],
    [" STUDIO ", "studio"],
    ["استوديو", "studio"],
    ["1 bedroom", "1br"],
    ["one bedroom", "1br"],
    ["One Bedroom", "1br"],
    ["1BR", "1br"],
    ["1 br", "1br"],
    ["غرفة واحدة", "1br"],
  ])("%j resolves to %s", (input, expected) => {
    expect(resolveUnitType(input)).toBe(expected);
  });

  it("returns undefined for an unknown unit type", () => {
    expect(resolveUnitType("villa")).toBeUndefined();
  });
});

describe("lookupIndex", () => {
  it("finds the placeholder average for an Arabic intake", () => {
    const result = lookupIndex("دبي مارينا", "غرفة واحدة");
    expect(result).toMatchObject({
      found: true,
      entry: { area: "dubai_marina", unit_type: "1br" },
      data_source: "demo sample, not official",
    });
  });

  it("reports an unknown area instead of guessing", () => {
    expect(lookupIndex("Palm Jumeirah", "studio")).toEqual({
      found: false,
      reason: "unknown_area",
      data_source: "demo sample, not official",
    });
  });

  it("reports an unknown unit type instead of guessing", () => {
    expect(lookupIndex("Deira", "3 bedroom")).toMatchObject({ found: false, reason: "unknown_unit_type" });
  });
});
