import mockIndex from "../../data/mock-index.json";

export interface IndexEntry {
  area: string;
  area_label: string;
  unit_type: string;
  unit_label: string;
  index_average_aed: number;
}

export type IndexLookup =
  | { found: true; entry: IndexEntry; data_source: string }
  | { found: false; reason: "unknown_area" | "unknown_unit_type" | "no_index_entry"; data_source: string };

export const DATA_SOURCE: string = mockIndex.data_source;

const AREA_ALIASES: Record<string, readonly string[]> = {
  jvc: ["jvc", "Jumeirah Village Circle", "قرية جميرا الدائرية"],
  dubai_marina: ["Dubai Marina", "Marina", "دبي مارينا"],
  deira: ["Deira", "ديرة"],
  al_barsha: ["Al Barsha", "Barsha", "البرشاء"],
};

const UNIT_ALIASES: Record<string, readonly string[]> = {
  studio: ["studio", "استوديو"],
  "1br": ["1 bedroom", "one bedroom", "1BR", "1 bed", "غرفة واحدة"],
};

// Case, whitespace, hyphen and underscore insensitive. NFKC folds Arabic
// presentation forms and full width characters to their canonical letters.
export function normalizeKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s_\-]+/g, "");
}

function buildAliasIndex(aliases: Record<string, readonly string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, names] of Object.entries(aliases)) {
    for (const name of [key, ...names]) map.set(normalizeKey(name), key);
  }
  return map;
}

const AREA_INDEX = buildAliasIndex(AREA_ALIASES);
const UNIT_INDEX = buildAliasIndex(UNIT_ALIASES);

export function resolveArea(input: string): string | undefined {
  return AREA_INDEX.get(normalizeKey(input));
}

export function resolveUnitType(input: string): string | undefined {
  return UNIT_INDEX.get(normalizeKey(input));
}

export function lookupIndex(area: string, unitType: string): IndexLookup {
  const areaKey = resolveArea(area);
  if (!areaKey) return { found: false, reason: "unknown_area", data_source: DATA_SOURCE };
  const unitKey = resolveUnitType(unitType);
  if (!unitKey) return { found: false, reason: "unknown_unit_type", data_source: DATA_SOURCE };
  const entry = (mockIndex.entries as IndexEntry[]).find(
    (e) => e.area === areaKey && e.unit_type === unitKey,
  );
  if (!entry) return { found: false, reason: "no_index_entry", data_source: DATA_SOURCE };
  return { found: true, entry, data_source: DATA_SOURCE };
}
