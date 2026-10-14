import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeIncreaseCap } from "./decree43";
import { arabicNamesFor, parseDldEvidence, type DldEvidenceFile } from "./dld-evidence";
import { DLD_BAND_TEXTS, DLD_NO_INCREASE, INDEX_ENTRIES, indexAverageAed, type DldCheck } from "./mock-index";

// For every check row copied from the DLD calculator, our Decree 43 engine must
// return DLD's own percent, increase and new rent exactly. A failure here means
// the data, the UNVERIFIED midpoint assumption or the engine disagrees with DLD.
// Never adjust the engine to make this pass.
const rows = INDEX_ENTRIES.flatMap((entry) =>
  entry.dld_checks.map((check) => ({
    label: `${entry.building} / ${entry.bedrooms} at AED ${check.rent_entered_aed} (${check.evidence_file ?? entry.evidence_file})`,
    entry,
    check,
  })),
);

// DLD shows text instead of an amount when there is no increase: "No Increase"
// on the result PDF, and "Not Applicable" (or the Arabic page's equivalent) for the amount.
const dldPercent = (check: DldCheck) => (check.dld_increase_percent === DLD_NO_INCREASE ? 0 : check.dld_increase_percent);
const dldIncreaseAed = (check: DldCheck) => (typeof check.dld_increase_aed === "string" ? 0 : check.dld_increase_aed);

describe("DLD cross-check", () => {
  it("has DLD check rows", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows)("$label: DLD's own figures add up", ({ check }) => {
    expect(check.rent_entered_aed + dldIncreaseAed(check)).toBe(check.dld_new_rent_aed);
    expect(dldPercent(check) === 0).toBe(typeof check.dld_increase_aed === "string");
  });

  it.each(rows)("$label: engine returns DLD's percent, increase and new rent", ({ entry, check }) => {
    const result = computeIncreaseCap({
      indexAverageAed: indexAverageAed(entry),
      currentRentAed: check.rent_entered_aed,
    });
    expect({
      percent: result.max_increase_percent,
      increase: result.max_increase_aed,
      new_rent: result.max_new_rent_aed,
    }).toEqual({
      percent: dldPercent(check),
      increase: dldIncreaseAed(check),
      new_rent: check.dld_new_rent_aed,
    });
  });
});

describe("DLD evidence files are copied unchanged", () => {
  const dir = new URL("../../docs/index-evidence/", import.meta.url);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: `docs/index-evidence/${f}`, json: JSON.parse(readFileSync(new URL(f, dir), "utf8")) as DldEvidenceFile }));
  const lookups = files.flatMap(({ name, json }) =>
    parseDldEvidence(json, name).map((parsed) => ({
      label: `${name} (${parsed.language}) at AED ${parsed.check.rent_entered_aed}`,
      parsed,
    })),
  );

  it("includes lookups from DLD's English and Arabic pages", () => {
    expect(lookups.some((l) => l.parsed.language === "en")).toBe(true);
    expect(lookups.some((l) => l.parsed.language === "ar")).toBe(true);
  });

  it.each(lookups)("$label is stored as a DLD check row", ({ parsed }) => {
    const entry = INDEX_ENTRIES.find(
      (e) => e.area === parsed.area && e.building === parsed.building && e.bedrooms === parsed.bedrooms,
    );
    expect(entry).toMatchObject({
      property_type: parsed.property_type,
      range_min_aed: parsed.range_min_aed,
      range_max_aed: parsed.range_max_aed,
      contract_end_date_used: parsed.contract_end_date,
    });
    expect(entry?.dld_checks).toContainEqual(parsed.check);
  });

  it.each(lookups)("$label: DLD's band wording is stored for its band", ({ parsed }) => {
    const band = DLD_BAND_TEXTS.find((b) => b.max_increase_percent === parsed.check.dld_increase_percent);
    expect(band?.[parsed.language]).toBe(parsed.band_text);
  });

  it("stores DLD's official Arabic names for every entry", () => {
    const names = files.find((f) => f.json.names)?.json.names;
    expect(names).toBeDefined();
    for (const entry of INDEX_ENTRIES) {
      const official = arabicNamesFor(entry, names!);
      expect(official, entry.building).toBeDefined();
      expect({
        area_ar: entry.area_ar,
        building_ar: entry.building_ar,
        bedrooms_ar: entry.bedrooms_ar,
        property_type_ar: entry.property_type_ar,
      }).toEqual(official);
    }
  });
});

describe("UNVERIFIED average assumption against DLD's ranges", () => {
  // If DLD's range is the average plus or minus 10 percent, rounding the derived
  // average back out must reproduce DLD's range. A row that fails this disproves
  // the assumption.
  it.each(INDEX_ENTRIES.map((entry) => ({ label: `${entry.building} / ${entry.bedrooms}`, entry })))(
    "$label: range is the derived average plus or minus 10 percent",
    ({ entry }) => {
      const average = indexAverageAed(entry);
      expect(Math.round((average * 9) / 10)).toBe(entry.range_min_aed);
      expect(Math.round((average * 11) / 10)).toBe(entry.range_max_aed);
    },
  );
});
