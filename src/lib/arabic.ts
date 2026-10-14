// Arabic text and number normalisation for index matching and amounts.
// No imports, so Node scripts can load this file directly.

// Arabic-Indic (U+0660 to U+0669) and Persian (U+06F0 to U+06F9) digits to 0 to 9.
export function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

// Letter forms callers and transcripts write interchangeably:
// alef with hamza above, hamza below, madda and wasla (U+0623, U+0625, U+0622,
// U+0671) to bare alef (U+0627); teh marbuta (U+0629) to heh (U+0647);
// alef maksura (U+0649) to yeh (U+064A). Tatweel (U+0640) and diacritics
// (harakat U+064B to U+065F, superscript alef U+0670) are removed.
export function foldArabic(value: string): string {
  return value
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "");
}

// Arabic thousands separator (U+066C) and Arabic comma (U+060C) between digits.
const GROUP_SEPARATOR_IN_NUMBER = /(\d)[\u066C\u060C](?=\d)/g;

// Reads an amount given as text, for example with Arabic-Indic digits and an
// Arabic thousands separator. Returns the input unchanged if it is not text.
export function normalizeAmount(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const ascii = toAsciiDigits(value.trim()).replace(GROUP_SEPARATOR_IN_NUMBER, "$1");
  return ascii === "" ? value : ascii;
}
