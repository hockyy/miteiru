import {toPinyinToneMarks} from "../handler/pinyinTones";

/**
 * Machine-stable readings for the language tools, whatever the learner's tone display setting:
 * pinyin as tone numbers (mei2, the neutral tone as 5) and with tone marks (méi), jyutping with tone
 * numbers (keoi5), and the tone of each syllable.
 */

/** A pinyin syllable with its tone as a number, neutral 5: pinyin-pro's ma0 becomes ma5. Empty stays empty. */
export const pinyinNumbered = (syllable: string): string => {
  const text = syllable.trim();
  if (!text) return "";
  if (/[0-5]$/.test(text)) return text.replace(/0$/, "5");
  // pinyin-pro leaves a syllable it has no reading for as the character itself.
  return /^[a-züv:ê]+$/i.test(text) ? `${text}5` : text;
};

/** A numbered syllable with tone marks: ni3 is nǐ, ma5 is ma. */
export const pinyinMarked = (numbered: string): string => (/[1-5]$/.test(numbered) ? toPinyinToneMarks(numbered) : numbered);

/** The tone of a numbered syllable, 1 to 5; null for something that is not one. */
export const numberedTone = (syllable: string, highest: number): number | null => {
  const match = syllable.match(/^[a-züv:ê]+([0-9])$/i);
  if (!match) return null;
  const tone = Number(match[1]);
  if (highest === 5 && tone === 0) return 5;
  return tone >= 1 && tone <= highest ? tone : null;
};

/** For comparing pinyin from different sources: lower case, ü however written (v, u:), neutral 5. */
export const comparablePinyin = (text: string): string => text
  .toLowerCase()
  .replace(/u:/g, "ü")
  .replace(/v/g, "ü")
  .split(/\s+/)
  .filter(Boolean)
  .map((syllable) => (/^[a-zü]+$/.test(syllable) ? `${syllable}5` : syllable.replace(/0$/, "5")))
  .join(" ");

/** Jyutping compared: lower case, single spaces. */
export const comparableJyutping = (text: string): string => text.toLowerCase().split(/\s+/).filter(Boolean).join(" ");

const VIETNAMESE_TONES: Array<[RegExp, string]> = [
  [/[\u0300]/u, "huyền"],
  [/[\u0301]/u, "sắc"],
  [/[\u0309]/u, "hỏi"],
  [/[\u0303]/u, "ngã"],
  [/[\u0323]/u, "nặng"]
];

/** The tone of a Vietnamese syllable by its mark: ngang (none), huyền, sắc, hỏi, ngã or nặng. */
export const vietnameseTone = (syllable: string): string | null => {
  if (!/\p{L}/u.test(syllable)) return null;
  const decomposed = syllable.normalize("NFD");
  return VIETNAMESE_TONES.find(([mark]) => mark.test(decomposed))?.[1] ?? "ngang";
};

/** Vietnamese without its diacritics (Tiếng Việt is Tieng Viet; đ is d). */
export const stripVietnamese = (text: string): string => text
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "D")
  .normalize("NFC");
