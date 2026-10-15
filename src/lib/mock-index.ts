import { z } from "zod";
import rawIndex from "../../data/mock-index.json";
import { foldArabic, toAsciiDigits } from "./arabic";
import { bedroomCount } from "./bedroom-count";
import { indexAverageAed } from "./index-average";
import { AREA_ALIASES, BEDROOM_ALIASES, BUILDING_ALIASES } from "./index-aliases";

export { indexAverageAed };

// DLD Rental Index figures, building level, copied by hand from the DLD website.
// The file keeps its original name. Adding a row is a data change only: the
// schema below rejects a malformed row and the DLD cross-check test runs our
// Decree 43 engine against DLD's own result for every check row.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// DLD shows text instead of numbers when there is no increase ("No Increase" on
// the result PDF; "Not Applicable" or its Arabic page equivalent for the amount).
// It is stored exactly as shown.
export const DLD_NO_INCREASE = "No Increase";

const dldCheckSchema = z.object({
  rent_entered_aed: z.number().positive(),
  dld_increase_percent: z.union([z.number().nonnegative(), z.literal(DLD_NO_INCREASE)]),
  dld_increase_aed: z.union([z.number().nonnegative(), z.string().trim().min(1)]),
  dld_new_rent_aed: z.number().positive(),
  // Set when the row comes from a different evidence file than the entry's.
  evidence_file: z.string().trim().min(1).optional(),
});

const entrySchema = z
  .object({
    area: z.string().trim().min(1),
    // Official DLD Arabic names, copied from DLD's Arabic page by scripts/import-dld-evidence.mjs.
    area_ar: z.string().trim().min(1),
    building: z.string().trim().min(1),
    // null where DLD's Arabic page shows only the English building name.
    building_ar: z.string().trim().min(1).nullable(),
    property_type: z.string().trim().min(1),
    property_type_ar: z.string().trim().min(1),
    bedrooms: z.string().trim().min(1),
    bedrooms_ar: z.string().trim().min(1),
    range_min_aed: z.number().positive(),
    range_max_aed: z.number().positive(),
    retrieved_date: isoDate,
    contract_end_date_used: isoDate,
    search: z.string().trim().min(1),
    source_url: z.url(),
    evidence_file: z.string().trim().min(1),
    dld_checks: z.array(dldCheckSchema),
  })
  .refine((e) => e.range_min_aed <= e.range_max_aed, "range_min_aed must not exceed range_max_aed");

export const CAP_PERCENTS = [0, 5, 10, 15, 20] as const;

// DLD's own wording for each band, from its calculator responses (English page
// and Arabic page), copied by scripts/import-dld-evidence.mjs.
const bandTextSchema = z.object({
  max_increase_percent: z.union(CAP_PERCENTS.map((p) => z.literal(p))),
  en: z.string().trim().min(1),
  en_evidence_file: z.string().trim().min(1),
  ar: z.string().trim().min(1),
  ar_evidence_file: z.string().trim().min(1),
});

const indexFileSchema = z.object({
  data_source: z.string().trim().min(1),
  entries: z.array(entrySchema).min(1),
  dld_band_text: z
    .array(bandTextSchema)
    .refine(
      (bands) => CAP_PERCENTS.every((p) => bands.filter((b) => b.max_increase_percent === p).length === 1),
      "dld_band_text needs exactly one entry for each band",
    ),
});

export type IndexFile = z.input<typeof indexFileSchema>;
export type IndexEntry = z.infer<typeof entrySchema>;
export type DldCheck = z.infer<typeof dldCheckSchema>;
export type DldBandText = z.infer<typeof bandTextSchema>;

export interface IndexAliases {
  areas: Readonly<Record<string, readonly string[]>>;
  buildings: Readonly<Record<string, readonly string[]>>;
  bedrooms: Readonly<Record<string, readonly string[]>>;
}

export type IndexLookupFailure = "unknown_area" | "unknown_building" | "unknown_bedrooms";

export type IndexLookup =
  | { found: true; entry: IndexEntry; index_average_aed: number; data_source: string }
  | { found: false; reason: IndexLookupFailure; data_source: string };

// Case, whitespace, punctuation and symbol insensitive (so "1bed room+Hall" and
// "1 bedroom hall" agree). NFKC folds Arabic presentation forms and full width
// characters; Arabic letter forms, tatweel and diacritics are folded as in
// foldArabic, and Arabic-Indic and Persian digits become 0 to 9. Matching is
// still exact on the result: there is no fuzzy or nearest match.
export function normalizeKey(value: string): string {
  return foldArabic(toAsciiDigits(value.normalize("NFKC")))
    .toLowerCase()
    .replace(/[\p{White_Space}\p{P}\p{S}\p{M}]+/gu, "");
}

function addName(map: Map<string, string>, name: string, target: string, kind: string): void {
  const key = normalizeKey(name);
  if (!key) throw new Error(`Empty ${kind} name "${name}"`);
  const existing = map.get(key);
  if (existing !== undefined && existing !== target) {
    throw new Error(`${kind} name "${name}" matches both "${existing}" and "${target}"`);
  }
  map.set(key, target);
}

const entryKey = (area: string, building: string, bedrooms: string) => JSON.stringify([area, building, bedrooms]);

// The file is validated by the schema, so it is accepted untyped (JSON imports widen literals).
export function buildIndex(file: unknown, aliases: IndexAliases) {
  const { data_source, entries, dld_band_text } = indexFileSchema.parse(file);

  const areaNames = new Map<string, string>();
  const buildingNamesByArea = new Map<string, Map<string, string>>();
  const bedroomNames = new Map<string, string>();
  const byKey = new Map<string, IndexEntry>();

  for (const entry of entries) {
    const key = entryKey(entry.area, entry.building, entry.bedrooms);
    if (byKey.has(key)) {
      throw new Error(`Duplicate index entry: ${entry.area} / ${entry.building} / ${entry.bedrooms}`);
    }
    byKey.set(key, entry);

    // DLD's English and official Arabic names always match; aliases add caller names.
    for (const name of [entry.area, entry.area_ar, ...(aliases.areas[entry.area] ?? [])]) {
      addName(areaNames, name, entry.area, "Area");
    }

    const buildings = buildingNamesByArea.get(entry.area) ?? new Map<string, string>();
    buildingNamesByArea.set(entry.area, buildings);
    for (const name of [entry.building, entry.building_ar ?? entry.building, ...(aliases.buildings[entry.building] ?? [])]) {
      addName(buildings, name, entry.building, "Building");
    }

    for (const name of [entry.bedrooms, entry.bedrooms_ar, ...(aliases.bedrooms[entry.bedrooms] ?? [])]) {
      addName(bedroomNames, name, entry.bedrooms, "Bedrooms");
    }
  }

  const resolveArea = (input: string) => areaNames.get(normalizeKey(input));
  const resolveBuilding = (area: string, input: string) => buildingNamesByArea.get(area)?.get(normalizeKey(input));
  const resolveBedrooms = (input: string) => bedroomNames.get(normalizeKey(input));

  // When the bedrooms value is not a known name, read its count ("3BR", Arabic
  // digits or number words) and take the building's DLD category with that
  // count. Only a category DLD lists for this building counts, and only if
  // exactly one has that count: no nearest or fuzzy match.
  function entryByCount(area: string, building: string, bedrooms: string): IndexEntry | undefined {
    const count = bedroomCount(bedrooms);
    if (count === undefined) return undefined;
    const matches = entries.filter((e) => e.area === area && e.building === building && bedroomCount(e.bedrooms) === count);
    return matches.length === 1 ? matches[0] : undefined;
  }

  function lookup(area: string, building: string, bedrooms: string): IndexLookup {
    const areaName = resolveArea(area);
    if (!areaName) return { found: false, reason: "unknown_area", data_source };
    const buildingName = resolveBuilding(areaName, building);
    if (!buildingName) return { found: false, reason: "unknown_building", data_source };
    const bedroomsLabel = resolveBedrooms(bedrooms);
    const entry =
      (bedroomsLabel ? byKey.get(entryKey(areaName, buildingName, bedroomsLabel)) : undefined) ??
      entryByCount(areaName, buildingName, bedrooms);
    if (!entry) return { found: false, reason: "unknown_bedrooms", data_source };
    return { found: true, entry, index_average_aed: indexAverageAed(entry), data_source };
  }

  const bandText = (percent: number): DldBandText => {
    const band = dld_band_text.find((b) => b.max_increase_percent === percent);
    if (!band) throw new Error(`No DLD band text for ${percent} percent`);
    return band;
  };

  return { data_source, entries, bandTexts: dld_band_text, resolveArea, resolveBuilding, resolveBedrooms, lookup, bandText };
}

const index = buildIndex(rawIndex, { areas: AREA_ALIASES, buildings: BUILDING_ALIASES, bedrooms: BEDROOM_ALIASES });

export const DATA_SOURCE: string = index.data_source;
export const INDEX_ENTRIES: readonly IndexEntry[] = index.entries;
export const DLD_BAND_TEXTS: readonly DldBandText[] = index.bandTexts;
export const { resolveArea, resolveBuilding, resolveBedrooms, bandText } = index;
export const lookupIndex = index.lookup;
