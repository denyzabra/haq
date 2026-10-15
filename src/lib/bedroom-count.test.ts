import { describe, expect, it } from "vitest";
import arabicWords from "../../data/arabic-bedroom-words.json";
import { bedroomCount } from "./bedroom-count";
import { INDEX_ENTRIES, lookupIndex } from "./mock-index";
import { runRentCheck } from "./rent-check";

// Arabic examples are read from the data file, never typed here.
const [AR_DIGIT, AR_INDIC_DIGIT, AR_WORDS] = arabicWords.examples;
const PERSIAN_THREE = String.fromCharCode(0x06f3);
const HAMRIA = INDEX_ENTRIES.find((e) => e.building === "AL HAMRIA")!;
const AAA = INDEX_ENTRIES.find((e) => e.building === "AAA RESIDENCE")!;

describe("bedroomCount", () => {
  it.each([
    [AR_DIGIT, 3],
    [AR_INDIC_DIGIT, 3],
    [AR_WORDS, 3],
    [`${PERSIAN_THREE} bedrooms`, 3],
    ["3BR", 3],
    ["three bedroom", 3],
    ["1 bed", 1],
    ["1bed room+Hall", 1],
    ["3 bed rooms+hall", 3],
    ["Studio", 0],
    [arabicWords.two_rooms, 2],
  ])("%j has %i bedrooms", (value, count) => {
    expect(bedroomCount(value)).toBe(count);
  });

  it("reads every Arabic number word next to a room word", () => {
    for (const [count, words] of Object.entries(arabicWords.numbers)) {
      for (const word of words) {
        expect(bedroomCount(`${word} ${arabicWords.rooms[0]}`), word).toBe(Number(count));
        expect(bedroomCount(`${arabicWords.rooms[1]} ${word}`), word).toBe(Number(count));
      }
    }
  });

  it.each(["3", "three", "bedroom", "2 bed 3 bed", "", AAA.bedrooms_ar])("%j has no single count", (value) => {
    expect(bedroomCount(value)).toBeUndefined();
  });
});

describe("index_lookup reads the bedroom count", () => {
  it.each([AR_DIGIT, AR_INDIC_DIGIT, AR_WORDS, "3BR", "three bedroom"])("%j at AL HAMRIA is DLD's 3 bedroom category", (bedrooms) => {
    const result = lookupIndex(HAMRIA.area_ar, HAMRIA.building_ar!, bedrooms);
    expect(result.found && result.entry.bedrooms).toBe(HAMRIA.bedrooms);
  });

  it('"1 bed" at AAA RESIDENCE is DLD\'s 1 bedroom category', () => {
    const result = lookupIndex("JVC", "Triple A", "1 bed");
    expect(result.found && result.entry.bedrooms).toBe(AAA.bedrooms);
  });

  it.each([
    ["AL HAMRIA", "2 bedrooms"],
    ["AL HAMRIA", "1 bed"],
    ["AL HAMRIA", "studio"],
    ["AAA RESIDENCE", "3BR"],
  ])("a count %s does not have (%j) is unknown_bedrooms", (building, bedrooms) => {
    const e = INDEX_ENTRIES.find((x) => x.building === building)!;
    expect(lookupIndex(e.area, e.building, bedrooms)).toMatchObject({ found: false, reason: "unknown_bedrooms" });
  });

  it("the health check value gives 5 percent and a maximum new rent of AED 78,750", () => {
    const result = runRentCheck({ area: HAMRIA.area_ar, building: HAMRIA.building_ar!, bedrooms: AR_DIGIT, current_rent_aed: 75000 });
    expect(result).toMatchObject({ outcome: "checked", bedrooms: HAMRIA.bedrooms, max_increase_percent: 5, max_new_rent_aed: 78750 });
  });
});
