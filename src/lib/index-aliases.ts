// Names callers use, keyed by the exact English name the DLD Rental Index shows
// in data/mock-index.json. DLD's English and official Arabic names always match
// on their own, so a new index row needs an entry here only if callers use a
// different name for it. Matching is exact after normalizeKey: no fuzzy or
// nearest match. Never add a wider name (a district such as "Deira", or an area
// name as a building name), because that would swap the caller's place for one
// in the index. After a change here, run `npm run sync:keyterms`.

export const AREA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Al Barsha South Fourth": [
    "JVC",
    "Jumeirah Village Circle",
    "جي في سي", // UNVERIFIED Arabic alias
    "قرية جميرا الدائرية", // UNVERIFIED Arabic alias
  ],
  "Al Eyas": ["Al Ayas", "Al Ayaas"],
  "Al Hamriya": [
    "Hamriya",
    "Al Hamriyah",
    "حمرية", // UNVERIFIED Arabic alias
  ],
};

export const BUILDING_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "AAA RESIDENCE": [
    "Triple A Residence",
    "Triple A",
    "تريبل ايه ريزيدنس", // UNVERIFIED Arabic alias
  ],
  "DUBAI MUNCIPALITY-SOUQ AL AYAAS": [
    "Souq Al Ayaas",
    "Souk Al Ayaas",
    "Dubai Municipality Souq Al Ayaas",
    "سوق العياص", // UNVERIFIED Arabic alias
  ],
};

// Keyed by DLD's bedrooms label. Add "Studio" style labels only where DLD lists
// them for a building; the label itself already matches without an alias.
export const BEDROOM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "1bed room+Hall": [
    "1 bed",
    "1 bedroom",
    "one bedroom",
    "1BR",
    "1 bedroom hall",
    "غرفة وصالة", // UNVERIFIED Arabic alias
    "غرفة نوم واحدة", // UNVERIFIED Arabic alias
  ],
  "3 bed rooms+hall": [
    "3 bed",
    "3 bedroom",
    "3 bedrooms",
    "three bedroom",
    "three bedrooms",
    "3BR",
    "3 bedroom hall",
    "ثلاث غرف وصالة", // UNVERIFIED Arabic alias
  ],
};
