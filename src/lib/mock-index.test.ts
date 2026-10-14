import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import rawIndex from "../../data/mock-index.json";
import { AREA_ALIASES, BEDROOM_ALIASES, BUILDING_ALIASES } from "./index-aliases";
import {
  buildIndex,
  DATA_SOURCE,
  INDEX_ENTRIES,
  indexAverageAed,
  lookupIndex,
  normalizeKey,
  resolveArea,
  resolveBedrooms,
  resolveBuilding,
  type IndexFile,
} from "./mock-index";

const AREA = "Al Barsha South Fourth";
const BUILDING = "AAA RESIDENCE";
const BEDROOMS = "1bed room+Hall";

const NO_ALIASES = { areas: {}, buildings: {}, bedrooms: {} };
const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const baseEntry = rawIndex.entries[0];
const withEntries = (...entries: unknown[]) =>
  ({ data_source: "test", entries, dld_band_text: rawIndex.dld_band_text }) as IndexFile;

describe("DLD index data", () => {
  it("is labelled with the DLD building level source and retrieval date", () => {
    expect(DATA_SOURCE).toBe("DLD Rental Index, building level, retrieved 14 October 2026");
  });

  it("reaches every entry by its DLD names", () => {
    for (const entry of INDEX_ENTRIES) {
      expect(lookupIndex(entry.area, entry.building, entry.bedrooms)).toMatchObject({ found: true, entry });
    }
  });

  it("names an evidence file that exists for every entry", () => {
    for (const entry of INDEX_ENTRIES) {
      expect(() => readFileSync(new URL(`../../${entry.evidence_file}`, import.meta.url))).not.toThrow();
    }
  });

  it("has aliases only for names that are in the index", () => {
    const has = (field: "area" | "building" | "bedrooms", name: string) => INDEX_ENTRIES.some((e) => e[field] === name);
    for (const name of Object.keys(AREA_ALIASES)) expect(has("area", name), name).toBe(true);
    for (const name of Object.keys(BUILDING_ALIASES)) expect(has("building", name), name).toBe(true);
    for (const name of Object.keys(BEDROOM_ALIASES)) expect(has("bedrooms", name), name).toBe(true);
  });

  it("resolves every quoted example in the tool parameter descriptions", () => {
    for (const file of ["tool_configs/index_lookup.json", "tool_configs/prepare_draft.json"]) {
      const config = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));
      const props = config.api_schema.request_body_schema.properties;
      const examples = (field: string): string[] =>
        [...String(props[field].description).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      for (const area of examples("area")) {
        for (const building of examples("building")) {
          for (const bedrooms of examples("bedrooms")) {
            expect(lookupIndex(area, building, bedrooms).found, `${file}: ${area} / ${building} / ${bedrooms}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("indexAverageAed (UNVERIFIED midpoint assumption)", () => {
  it.each([
    [100, 200, 150],
    [100, 102, 101],
    [100, 101, 101],
    [70_000, 70_000, 70_000],
  ])("midpoint of %d and %d is %d, rounded to the nearest dirham", (min, max, expected) => {
    expect(indexAverageAed({ range_min_aed: min, range_max_aed: max })).toBe(expected);
  });

  it("is what lookupIndex returns", () => {
    const result = lookupIndex(AREA, BUILDING, BEDROOMS);
    if (!result.found) throw new Error("expected an entry");
    expect(result.index_average_aed).toBe(indexAverageAed(result.entry));
  });
});

describe("area names", () => {
  it.each([
    "Al Barsha South Fourth",
    "al barsha south fourth",
    "AL-BARSHA-SOUTH-FOURTH",
    "JVC",
    "jvc",
    "J.V.C.",
    "Jumeirah Village Circle",
    "  jumeirah   village  circle ",
  ])("%j resolves to the DLD area", (input) => {
    expect(resolveArea(input)).toBe(AREA);
  });

  it.each(["Al Barsha", "Barsha South", "Palm Jumeirah", "JVT"])("%j is not swapped for a nearby area", (input) => {
    expect(resolveArea(input)).toBeUndefined();
  });
});

describe("building names", () => {
  it.each(["AAA RESIDENCE", "AAA Residence", "aaa residence", "Triple A Residence", "triple-a residence"])(
    "%j resolves to the DLD building",
    (input) => {
      expect(resolveBuilding(AREA, input)).toBe(BUILDING);
    },
  );

  it.each(["AAA Residences", "Triple A", "Bloom Towers"])("%j is not swapped for a nearby building", (input) => {
    expect(resolveBuilding(AREA, input)).toBeUndefined();
  });

  it("only matches a building inside its own area", () => {
    expect(resolveBuilding("Deira", "AAA Residence")).toBeUndefined();
  });
});

describe("bedrooms", () => {
  it.each([
    "1bed room+Hall",
    "1 bed",
    "1-bed",
    "1 bedroom",
    "one bedroom",
    "One-Bedroom",
    "1BR",
    "1 br",
    "1 bedroom hall",
    "1 bedroom + hall",
  ])("%j resolves to DLD's label", (input) => {
    expect(resolveBedrooms(input)).toBe(BEDROOMS);
  });

  it.each(["studio", "2 bedroom", "villa"])("%j has no DLD label in the index", (input) => {
    expect(resolveBedrooms(input)).toBeUndefined();
  });
});

describe("lookupIndex", () => {
  it("finds the building for an Arabic and alias intake", () => {
    const [areaAlias] = AREA_ALIASES[AREA].filter(isArabic);
    const result = lookupIndex(areaAlias, "Triple A Residence", BEDROOM_ALIASES[BEDROOMS].filter(isArabic)[0]);
    expect(result).toMatchObject({
      found: true,
      entry: { area: AREA, building: BUILDING, bedrooms: BEDROOMS },
      data_source: DATA_SOURCE,
    });
  });

  it.each([
    ["an unknown area", "Palm Jumeirah", "AAA Residence", "1 bedroom", "unknown_area"],
    ["a building not in the index", "JVC", "Bloom Towers", "1 bedroom", "unknown_building"],
    ["bedrooms DLD did not list for the building", "JVC", "AAA Residence", "studio", "unknown_bedrooms"],
    ["unknown bedrooms", "JVC", "AAA Residence", "2 bedroom", "unknown_bedrooms"],
  ])("reports %s instead of guessing", (_label, area, building, bedrooms, reason) => {
    expect(lookupIndex(area, building, bedrooms)).toEqual({ found: false, reason, data_source: DATA_SOURCE });
  });
});

describe("buildIndex rejects bad data", () => {
  it("rejects a duplicate area, building and bedrooms entry", () => {
    expect(() => buildIndex(withEntries(baseEntry, { ...baseEntry }), NO_ALIASES)).toThrow(/Duplicate index entry/);
  });

  it("rejects two spellings of one building as separate entries", () => {
    expect(() => buildIndex(withEntries(baseEntry, { ...baseEntry, building: "aaa residence" }), NO_ALIASES)).toThrow(
      /matches both/,
    );
  });

  it("rejects a range whose minimum is above its maximum", () => {
    expect(() => buildIndex(withEntries({ ...baseEntry, range_min_aed: 80_000, range_max_aed: 70_000 }), NO_ALIASES)).toThrow();
  });

  it.each(["range_min_aed", "building", "bedrooms", "source_url", "evidence_file", "dld_checks"])(
    "rejects an entry without %s",
    (field) => {
      const entry: Record<string, unknown> = { ...baseEntry };
      delete entry[field];
      expect(() => buildIndex(withEntries(entry), NO_ALIASES)).toThrow();
    },
  );

  it("rejects an alias that would match two different names", () => {
    const second = { ...baseEntry, building: "Other Tower" };
    const aliases = { ...NO_ALIASES, buildings: { "AAA RESIDENCE": ["Twin"], "Other Tower": ["twin"] } };
    expect(() => buildIndex(withEntries(baseEntry, second), aliases)).toThrow(/matches both/);
  });
});

// Arabic strings below are read from the index data or the alias table, or built
// from code points, never typed.
describe("Arabic names", () => {
  it.each(INDEX_ENTRIES.map((entry) => ({ label: entry.building, entry })))(
    "$label: DLD's official Arabic names resolve to the entry",
    ({ entry }) => {
      expect(resolveArea(entry.area_ar)).toBe(entry.area);
      if (entry.building_ar) expect(resolveBuilding(entry.area, entry.building_ar)).toBe(entry.building);
      expect(resolveBedrooms(entry.bedrooms_ar)).toBe(entry.bedrooms);
      expect(lookupIndex(entry.area_ar, entry.building_ar ?? entry.building, entry.bedrooms_ar)).toMatchObject({
        found: true,
        entry,
      });
    },
  );

  it("resolves both DLD spellings of Al Hamriya, with teh marbuta and with heh", () => {
    const hamria = INDEX_ENTRIES.find((e) => e.building === "AL HAMRIA")!;
    const withHeh = hamria.area_ar;
    const withTehMarbuta = hamria.building_ar!;
    expect(withHeh).not.toBe(withTehMarbuta);
    for (const spelling of [withHeh, withTehMarbuta]) {
      expect(resolveArea(spelling)).toBe("Al Hamriya");
      expect(resolveBuilding("Al Hamriya", spelling)).toBe("AL HAMRIA");
    }
  });

  it("resolves every alias in the alias table to its DLD name", () => {
    const area = (name: string) => INDEX_ENTRIES.find((e) => e.building === name)!.area;
    for (const [name, aliases] of Object.entries(AREA_ALIASES)) for (const a of aliases) expect(resolveArea(a), a).toBe(name);
    for (const [name, aliases] of Object.entries(BUILDING_ALIASES)) {
      for (const a of aliases) expect(resolveBuilding(area(name), a), a).toBe(name);
    }
    for (const [name, aliases] of Object.entries(BEDROOM_ALIASES)) for (const a of aliases) expect(resolveBedrooms(a), a).toBe(name);
  });

  const aaa = INDEX_ENTRIES.find((e) => e.building === BUILDING)!;
  const ALEF = "\u0627";
  const YEH = "\u064A";

  it.each([
    ["hamza above", "\u0623"],
    ["hamza below", "\u0625"],
    ["madda", "\u0622"],
    ["wasla", "\u0671"],
  ])("treats alef with %s as bare alef", (_label, form) => {
    expect(resolveBuilding(AREA, aaa.building_ar!.replace(ALEF, form))).toBe(BUILDING);
  });

  it("treats alef maksura as yeh", () => {
    expect(aaa.building_ar).toContain(YEH);
    expect(resolveBuilding(AREA, aaa.building_ar!.replace(YEH, "\u0649"))).toBe(BUILDING);
  });

  it("treats teh marbuta as heh", () => {
    expect(aaa.bedrooms_ar).toContain("\u0629");
    expect(resolveBedrooms(aaa.bedrooms_ar.replaceAll("\u0629", "\u0647"))).toBe(BEDROOMS);
  });

  it("ignores tatweel and diacritics", () => {
    const [first, ...rest] = aaa.area_ar;
    expect(resolveArea(`${first}\u064E\u0640${rest.join("")}\u0651`)).toBe(AREA);
  });

  it("reads Arabic-Indic and Persian digits as 0 to 9", () => {
    expect(normalizeKey("\u0661 bed")).toBe(normalizeKey("1 bed"));
    expect(normalizeKey("\u06F3 bed")).toBe(normalizeKey("3 bed"));
    expect(resolveBedrooms("\u0661BR")).toBe(BEDROOMS);
  });

  it("stays exact: a shortened Arabic name does not match", () => {
    expect(resolveArea(aaa.area_ar.slice(0, -1))).toBeUndefined();
  });
});

describe("ASR keyterms", () => {
  it("include every DLD area, building and bedrooms name, official Arabic names and area and building aliases", () => {
    const config = JSON.parse(readFileSync(new URL("../../agent_configs/HAQ.json", import.meta.url), "utf8"));
    const keyterms = new Set<string>(config.conversation_config.asr.keywords.map((k: string) => k.toLowerCase()));
    const required = INDEX_ENTRIES.flatMap((e) => [
      e.area,
      e.area_ar,
      ...(AREA_ALIASES[e.area] ?? []),
      e.building,
      ...(e.building_ar ? [e.building_ar] : []),
      ...(BUILDING_ALIASES[e.building] ?? []),
      e.bedrooms_ar,
    ]);
    const missing = required.filter((k) => !keyterms.has(k.toLowerCase()));
    expect(missing, "run npm run sync:keyterms").toEqual([]);
  });
});
