import { AREA_ALIASES, BEDROOM_ALIASES, BUILDING_ALIASES } from "./index-aliases";
import { INDEX_ENTRIES, type IndexEntry } from "./mock-index";

// Rows for the "Try it with these buildings" box on the demo page, built from
// data/mock-index.json and the alias table, so the page always lists exactly the
// buildings index_lookup can check. Arabic names are DLD's, read from the data.
export interface DemoBuilding {
  area: string;
  areaDld: string;
  areaAr: string;
  building: string;
  buildingDld: string;
  buildingAr: string | null;
  bedrooms: string;
  bedroomsDld: string;
  bedroomsAr: string;
}

export const DEMO_EXAMPLE = "JVC, Triple A Residence, one bedroom, my rent is 60,000 dirhams a year.";

const ARABIC = /[؀-ۿ]/;

// The first English alias, which is the name callers use (for example JVC).
const spokenName = (aliases: readonly string[] | undefined, official: string) =>
  aliases?.find((a) => !ARABIC.test(a)) ?? official;

// The digit form a caller would say, plural when it applies ("1 bedroom", "3 bedrooms").
const spokenBedrooms = (aliases: readonly string[] | undefined, official: string) =>
  aliases?.filter((a) => /^\d+ bedrooms?$/i.test(a)).at(-1) ?? official;

export function demoBuildings(entries: readonly IndexEntry[] = INDEX_ENTRIES): DemoBuilding[] {
  return entries.map((e) => ({
    area: spokenName(AREA_ALIASES[e.area], e.area),
    areaDld: e.area,
    areaAr: e.area_ar,
    building: spokenName(BUILDING_ALIASES[e.building], e.building),
    buildingDld: e.building,
    buildingAr: e.building_ar,
    bedrooms: spokenBedrooms(BEDROOM_ALIASES[e.bedrooms], e.bedrooms),
    bedroomsDld: e.bedrooms,
    bedroomsAr: e.bedrooms_ar,
  }));
}
