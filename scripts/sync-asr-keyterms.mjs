// Adds every DLD area and building name in data/mock-index.json (English and
// official Arabic), their aliases, and DLD's official Arabic bedrooms names to
// the agent's ASR keyterms in agent_configs/HAQ.json. Existing keyterms are kept.
// The agent uses Scribe realtime, which takes at most 50 keyterms of at most 20
// characters each (ElevenLabs keyterm prompting guide), so longer names are
// left out or removed and the script stops if the list would pass 50.
// Only the keywords array is rewritten, so the rest of the file stays byte for
// byte as the ElevenLabs CLI wrote it.
// Usage: npm run sync:keyterms (needs Node 23.6 or newer to import the .ts alias table)
import { readFileSync, writeFileSync } from "node:fs";
import { AREA_ALIASES, BUILDING_ALIASES } from "../src/lib/index-aliases.ts";

const MAX_KEYTERMS = 50;
const MAX_CHARACTERS = 20;
const fits = (k) => [...k].length <= MAX_CHARACTERS;

const CONFIG = new URL("../agent_configs/HAQ.json", import.meta.url);
const index = JSON.parse(readFileSync(new URL("../data/mock-index.json", import.meta.url), "utf8"));

const required = index.entries.flatMap((e) => [
  e.area,
  e.area_ar,
  ...(AREA_ALIASES[e.area] ?? []),
  e.building,
  ...(e.building_ar ? [e.building_ar] : []),
  ...(BUILDING_ALIASES[e.building] ?? []),
  e.bedrooms_ar,
]);

const text = readFileSync(CONFIG, "utf8");
const current = JSON.parse(text).conversation_config.asr.keywords;
const kept = current.filter(fits);
const removed = current.filter((k) => !fits(k));
const seen = new Set(kept.map((k) => k.toLowerCase()));
const added = required.filter((k) => fits(k) && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()));
const skipped = [...new Set(required.filter((k) => !fits(k)))];
const keywords = [...kept, ...added];

if (keywords.length > MAX_KEYTERMS) {
  throw new Error(`${keywords.length} ASR keyterms is over the Scribe realtime limit of ${MAX_KEYTERMS}; remove some aliases.`);
}
if (skipped.length > 0) console.log(`Over ${MAX_CHARACTERS} characters, not added: ${skipped.join(", ")}`);

if (added.length === 0 && removed.length === 0) {
  console.log("ASR keyterms already include every index name that fits.");
} else {
  const start = text.indexOf('"keywords": [', text.indexOf('"asr": {'));
  const end = text.indexOf("]", start) + 1;
  const indent = text.slice(text.lastIndexOf("\n", start) + 1, start);
  const items = keywords.map((k) => `${indent}    ${JSON.stringify(k)}`).join(",\n");
  const updated = `${text.slice(0, start)}"keywords": [\n${items}\n${indent}]${text.slice(end)}`;
  if (JSON.stringify(JSON.parse(updated).conversation_config.asr.keywords) !== JSON.stringify(keywords)) {
    throw new Error("Could not update the keywords array safely; edit agent_configs/HAQ.json by hand.");
  }
  writeFileSync(CONFIG, updated);
  if (removed.length > 0) console.log(`Removed ${removed.length} ASR keyterms over ${MAX_CHARACTERS} characters: ${removed.join(", ")}`);
  if (added.length > 0) console.log(`Added ${added.length} ASR keyterms: ${added.join(", ")}`);
  console.log(`${keywords.length} ASR keyterms.`);
}
