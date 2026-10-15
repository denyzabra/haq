import { describe, expect, it } from "vitest";
import { DEMO_EXAMPLE, demoBuildings } from "./demo-buildings";
import { INDEX_ENTRIES, resolveArea, resolveBedrooms, resolveBuilding } from "./mock-index";
import { runRentCheck } from "./rent-check";

describe("demo page buildings", () => {
  const rows = demoBuildings();

  it("lists one row per index entry", () => {
    expect(rows).toHaveLength(INDEX_ENTRIES.length);
  });

  it.each(rows.map((row, i) => ({ row, entry: INDEX_ENTRIES[i], name: INDEX_ENTRIES[i].building })))(
    "$name: every name shown on the page resolves to that entry",
    ({ row, entry }) => {
      for (const area of [row.area, row.areaDld, row.areaAr]) expect(resolveArea(area), area).toBe(entry.area);
      for (const building of [row.building, row.buildingDld, ...(row.buildingAr ? [row.buildingAr] : [])]) {
        expect(resolveBuilding(entry.area, building), building).toBe(entry.building);
      }
      for (const bedrooms of [row.bedrooms, row.bedroomsDld, row.bedroomsAr]) expect(resolveBedrooms(bedrooms), bedrooms).toBe(entry.bedrooms);
    },
  );

  it("shows the names callers use next to DLD's", () => {
    expect(rows.map((r) => [r.area, r.building, r.bedrooms])).toEqual([
      ["JVC", "Triple A Residence", "1 bedroom"],
      ["Al Ayas", "Souq Al Ayaas", "1 bedroom"],
      ["Hamriya", "AL HAMRIA", "3 bedrooms"],
    ]);
  });

  it("the example sentence gets a checked result", () => {
    const [area, building, bedrooms] = DEMO_EXAMPLE.split(", ");
    const result = runRentCheck({ area, building, bedrooms, current_rent_aed: 60000 });
    expect(result).toMatchObject({ outcome: "checked", building: "AAA RESIDENCE", max_increase_percent: 5, max_new_rent_aed: 63000 });
  });
});
