// Copies DLD values from evidence files in docs/index-evidence/ into
// data/mock-index.json: calculator lookups become DLD check rows on the matching
// entry, DLD's band wording is stored per band (English page and Arabic page),
// and DLD's official Arabic names are added to each entry. Values are read from
// the evidence, never typed. Existing values that disagree stop the import.
// Rerunning is safe. Usage: npm run import:dld -- docs/index-evidence/<file>.json
// (Node 23.6 or newer)
import { readFileSync, writeFileSync } from "node:fs";
import { arabicNamesFor, parseDldEvidence } from "../src/lib/dld-evidence.ts";

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("Usage: npm run import:dld -- docs/index-evidence/<file>.json");

const INDEX = new URL("../data/mock-index.json", import.meta.url);
const index = JSON.parse(readFileSync(INDEX, "utf8"));
index.dld_band_text ??= [];

const ENTRY_KEYS = [
  "area", "area_ar", "building", "building_ar", "property_type", "property_type_ar", "bedrooms", "bedrooms_ar",
  "range_min_aed", "range_max_aed", "retrieved_date", "contract_end_date_used", "search", "source_url",
  "evidence_file", "dld_checks",
];

function setOnce(target, key, value, what) {
  if (target[key] !== undefined && target[key] !== value) throw new Error(`${what}: stored value differs from the evidence`);
  target[key] = value;
}

const report = [];
for (const file of files) {
  const evidence = JSON.parse(readFileSync(file, "utf8"));
  let rows = 0;
  for (const parsed of parseDldEvidence(evidence, file)) {
    const entry = index.entries.find(
      (e) => e.area === parsed.area && e.building === parsed.building && e.bedrooms === parsed.bedrooms,
    );
    if (!entry) throw new Error(`No index entry for ${parsed.area} / ${parsed.building} / ${parsed.bedrooms}`);
    for (const field of ["property_type", "range_min_aed", "range_max_aed"]) {
      if (entry[field] !== parsed[field]) throw new Error(`${field} differs from the index entry for ${parsed.building}`);
    }
    if (entry.contract_end_date_used !== parsed.contract_end_date) {
      throw new Error(`Contract end date differs from the index entry for ${parsed.building}`);
    }
    const same = (row) => row.rent_entered_aed === parsed.check.rent_entered_aed && row.evidence_file === file;
    if (!entry.dld_checks.some(same)) {
      entry.dld_checks.push(parsed.check);
      rows += 1;
    }
    const percent = parsed.check.dld_increase_percent;
    let band = index.dld_band_text.find((b) => b.max_increase_percent === percent);
    if (!band) index.dld_band_text.push((band = { max_increase_percent: percent }));
    setOnce(band, parsed.language, parsed.band_text, `Band text ${percent}% (${parsed.language})`);
    if (band[`${parsed.language}_evidence_file`] === undefined) band[`${parsed.language}_evidence_file`] = file;
  }
  let named = 0;
  if (evidence.names) {
    for (const entry of index.entries) {
      const names = arabicNamesFor(entry, evidence.names);
      if (!names) continue;
      for (const [key, value] of Object.entries(names)) setOnce(entry, key, value, `${key} of ${entry.building}`);
      named += 1;
    }
  }
  report.push(`${file}: ${rows} new check rows, Arabic names for ${named} entries`);
}

index.entries = index.entries.map((entry) =>
  Object.fromEntries([
    ...ENTRY_KEYS.filter((k) => k in entry).map((k) => [k, entry[k]]),
    ...Object.entries(entry).filter(([k]) => !ENTRY_KEYS.includes(k)),
  ]),
);
index.dld_band_text.sort((a, b) => a.max_increase_percent - b.max_increase_percent);
index.dld_band_text = index.dld_band_text.map((b) => ({
  max_increase_percent: b.max_increase_percent,
  en: b.en,
  en_evidence_file: b.en_evidence_file,
  ar: b.ar,
  ar_evidence_file: b.ar_evidence_file,
}));

writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
console.log(report.join("\n"));
