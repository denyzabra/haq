import arabicWords from "../../data/arabic-bedroom-words.json";
import { foldArabic, toAsciiDigits } from "./arabic";

// Reads the bedroom count from a bedrooms value, so index_lookup can match "3BR",
// "three bedroom" or an Arabic value with digits or number words to the DLD
// category with that count for the building. A count only counts when it sits
// next to a room or bedroom word; "studio" is 0. A value with no count, or with
// two different counts, gives undefined. The Arabic words are in
// data/arabic-bedroom-words.json (UNVERIFIED).

const fold = (word: string) => foldArabic(word).toLowerCase();

const NUMBER_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ...Object.entries(arabicWords.numbers).flatMap(([count, words]) => words.map((w) => [fold(w), Number(count)] as const)),
]);
const TWO_ROOMS = fold(arabicWords.two_rooms);
const ROOM_WORDS = new Set(["bed", "beds", "bedroom", "bedrooms", "br", "room", "rooms", ...arabicWords.rooms.map(fold), TWO_ROOMS]);

function tokens(value: string): string[] {
  return fold(toAsciiDigits(value.normalize("NFKC")))
    .replace(/(\d)(?=\p{L})/gu, "$1 ")
    .replace(/(\p{L})(?=\d)/gu, "$1 ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function bedroomCount(value: string): number | undefined {
  const words = tokens(value);
  const counts = new Set<number>();
  const isRoom = (word: string | undefined) => word !== undefined && ROOM_WORDS.has(word);
  words.forEach((word, i) => {
    const n = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS.get(word);
    if (n !== undefined && (isRoom(words[i - 1]) || isRoom(words[i + 1]))) counts.add(n);
    if (word === TWO_ROOMS) counts.add(2);
    if (word === "studio") counts.add(0);
  });
  return counts.size === 1 ? [...counts][0] : undefined;
}
