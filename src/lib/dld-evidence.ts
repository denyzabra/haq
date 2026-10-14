// Reads the DLD Rental Index evidence kept in docs/index-evidence/*.json: raw
// calculator responses from DLD's English page (`lookups`) and Arabic page
// (`arabic_band_lookups`), and DLD's official Arabic names (`names`). Used by
// scripts/import-dld-evidence.mjs to copy DLD's values into data/mock-index.json,
// and by tests to prove the stored values still match the evidence.
// Every value, including every Arabic string, is read from the file, never typed.
// No imports, so Node can load this file directly.

export interface DldResponse {
  AreaName: string;
  BuildingName: string;
  Rentalcategory: string;
  RentalType: string;
  MinValue: string;
  MaxValue: string;
  Result: string;
  PercentageIncrease: string;
  AmountIncrease: string;
  RentAmountAfterIncrease: string;
  ErrorMsg: string | null;
}

export interface DldLookup {
  inputs: {
    contract_end_date: string;
    current_annual_rent_aed: number;
    area?: string;
    building_name?: string;
    area_id?: string;
    building_id?: string;
  };
  response: DldResponse;
}

export interface DldNames {
  property_types: Array<{ dld_value: string; en: string; ar: string }>;
  areas: Array<{ dld_id: string; en: string; ar: string }>;
  buildings: Array<{ dld_id: string; area_id: string; en: string; ar: string; note?: string }>;
  bedrooms: Array<{ en: string; ar: string }>;
}

export interface DldEvidenceFile {
  lookups?: DldLookup[];
  arabic_band_lookups?: DldLookup[];
  names?: DldNames;
}

export interface ParsedDldLookup {
  language: "en" | "ar";
  area: string;
  building: string;
  bedrooms: string;
  property_type: string;
  contract_end_date: string;
  range_min_aed: number;
  range_max_aed: number;
  band_text: string;
  check: {
    rent_entered_aed: number;
    dld_increase_percent: number;
    // DLD shows text ("Not Applicable" in English) instead of an amount when there is no increase.
    dld_increase_aed: number | string;
    dld_new_rent_aed: number;
    evidence_file: string;
  };
}

const NUMBER_ONLY = /^(\d+(?:\.\d+)?)$/;
const PERCENT = /^(\d+(?:\.\d+)?)%$/;
// An amount followed by DLD's unit text in either language, for example "3577.5 AED Annually".
const LEADING_AMOUNT = /^(\d+(?:\.\d+)?)(?:\s|$)/;

function number(value: string, pattern: RegExp, field: string): number {
  const m = pattern.exec(value.trim());
  if (!m) throw new Error(`Unexpected DLD ${field}: ${JSON.stringify(value)}`);
  return Number(m[1]);
}

// DLD shows dates as DD/MM/YYYY; the index file stores YYYY-MM-DD.
function isoDate(ddmmyyyy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy);
  if (!m) throw new Error(`Unexpected DLD date: ${JSON.stringify(ddmmyyyy)}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function one<T>(items: T[], found: (item: T) => boolean, what: string): T {
  const matches = items.filter(found);
  if (matches.length !== 1) throw new Error(`Expected one DLD ${what}, found ${matches.length}`);
  return matches[0];
}

// English names of an Arabic page response, matched through DLD's own option IDs.
function englishNames(lookup: DldLookup, names: DldNames) {
  const { inputs, response } = lookup;
  const area = one(names.areas, (a) => a.dld_id === inputs.area_id && a.ar === response.AreaName, "area");
  const building = one(
    names.buildings,
    (b) => b.dld_id === inputs.building_id && b.area_id === area.dld_id && b.ar === response.BuildingName,
    "building",
  );
  const bedrooms = one(names.bedrooms, (b) => b.ar === response.Rentalcategory, "bedrooms");
  const propertyType = one(names.property_types, (p) => p.ar === response.RentalType, "property type");
  return { area: area.en, building: building.en, bedrooms: bedrooms.en, property_type: propertyType.en };
}

function parseLookup(lookup: DldLookup, language: "en" | "ar", evidenceFile: string, names?: DldNames): ParsedDldLookup {
  const { inputs, response } = lookup;
  if (response.ErrorMsg) throw new Error(`DLD returned an error: ${response.ErrorMsg}`);
  if (language === "en" && (response.AreaName !== inputs.area || response.BuildingName !== inputs.building_name)) {
    throw new Error("DLD response does not match the lookup inputs");
  }
  if (language === "ar" && !names) throw new Error("Arabic lookups need the names list from the same file");
  const english =
    language === "en"
      ? { area: response.AreaName, building: response.BuildingName, bedrooms: response.Rentalcategory, property_type: response.RentalType }
      : englishNames(lookup, names!);

  const percent = number(response.PercentageIncrease, PERCENT, "PercentageIncrease");
  const amount = LEADING_AMOUNT.exec(response.AmountIncrease.trim());
  if (!amount && percent !== 0) throw new Error(`DLD shows no increase amount for ${percent}%`);
  return {
    language,
    ...english,
    contract_end_date: isoDate(inputs.contract_end_date),
    range_min_aed: number(response.MinValue, NUMBER_ONLY, "MinValue"),
    range_max_aed: number(response.MaxValue, NUMBER_ONLY, "MaxValue"),
    band_text: response.Result,
    check: {
      rent_entered_aed: inputs.current_annual_rent_aed,
      dld_increase_percent: percent,
      dld_increase_aed: amount ? Number(amount[1]) : response.AmountIncrease,
      dld_new_rent_aed: number(response.RentAmountAfterIncrease, LEADING_AMOUNT, "RentAmountAfterIncrease"),
      evidence_file: evidenceFile,
    },
  };
}

export function parseDldEvidence(file: DldEvidenceFile, evidenceFile: string): ParsedDldLookup[] {
  return [
    ...(file.lookups ?? []).map((l) => parseLookup(l, "en", evidenceFile)),
    ...(file.arabic_band_lookups ?? []).map((l) => parseLookup(l, "ar", evidenceFile, file.names)),
  ];
}

export interface ArabicNames {
  area_ar: string;
  building_ar: string | null;
  bedrooms_ar: string;
  property_type_ar: string;
}

// DLD's official Arabic names for an index entry, or undefined if the names list
// does not cover it. Where DLD's Arabic page shows the English building name,
// DLD has no Arabic name for the building, so building_ar is null.
export function arabicNamesFor(
  entry: { area: string; building: string; bedrooms: string; property_type: string },
  names: DldNames,
): ArabicNames | undefined {
  const area = names.areas.find((a) => a.en === entry.area);
  const building = area && names.buildings.find((b) => b.en === entry.building && b.area_id === area.dld_id);
  const bedrooms = names.bedrooms.find((b) => b.en === entry.bedrooms);
  const propertyType = names.property_types.find((p) => p.en === entry.property_type);
  if (!area || !building || !bedrooms || !propertyType) return undefined;
  return {
    area_ar: area.ar,
    building_ar: building.ar === building.en ? null : building.ar,
    bedrooms_ar: bedrooms.ar,
    property_type_ar: propertyType.ar,
  };
}
