import { describe, expect, it } from "vitest";
import { foldArabic, normalizeAmount, toAsciiDigits } from "./arabic";
import { amountAed } from "./rent-check";

// Inputs are built from code points so no Arabic is typed by hand.
const arabicIndic = (digits: string) => [...digits].map((d) => String.fromCharCode(0x0660 + Number(d))).join("");
const persian = (digits: string) => [...digits].map((d) => String.fromCharCode(0x06f0 + Number(d))).join("");
const ARABIC_THOUSANDS = "\u066C";
const ARABIC_COMMA = "\u060C";

describe("toAsciiDigits", () => {
  it("converts Arabic-Indic and Persian digits", () => {
    expect(toAsciiDigits(arabicIndic("0123456789"))).toBe("0123456789");
    expect(toAsciiDigits(persian("0123456789"))).toBe("0123456789");
  });
});

describe("foldArabic", () => {
  it.each([
    ["alef with hamza above", "\u0623", "\u0627"],
    ["alef with hamza below", "\u0625", "\u0627"],
    ["alef with madda", "\u0622", "\u0627"],
    ["alef wasla", "\u0671", "\u0627"],
    ["teh marbuta", "\u0629", "\u0647"],
    ["alef maksura", "\u0649", "\u064A"],
    ["tatweel", "\u0640", ""],
    ["fatha", "\u064E", ""],
    ["shadda", "\u0651", ""],
    ["superscript alef", "\u0670", ""],
  ])("folds %s", (_label, input, expected) => {
    expect(foldArabic(input)).toBe(expected);
  });
});

describe("rent amounts", () => {
  it.each([
    ["Arabic-Indic digits with the Arabic thousands separator", `${arabicIndic("75")}${ARABIC_THOUSANDS}${arabicIndic("000")}`],
    ["Persian digits with the Arabic comma", `${persian("75")}${ARABIC_COMMA}${persian("000")}`],
    ["plain digits as text", "75000"],
    ["a number", 75_000],
  ])("parses %s to 75000", (_label, input) => {
    expect(amountAed.parse(input)).toBe(75_000);
  });

  it("only ignores a separator between digits", () => {
    expect(normalizeAmount(`${ARABIC_THOUSANDS}75`)).toBe(`${ARABIC_THOUSANDS}75`);
    expect(amountAed.safeParse(`${ARABIC_THOUSANDS}75`).success).toBe(false);
  });
});
