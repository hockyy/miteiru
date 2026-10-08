import {analyse} from "chardet";
import iconv from "iconv-lite";

const BYTE_ORDER_MARKS: [number[], string][] = [
  [[0xff, 0xfe, 0x00, 0x00], "utf-32le"],
  [[0x00, 0x00, 0xfe, 0xff], "utf-32be"],
  [[0xef, 0xbb, 0xbf], "utf-8"],
  [[0xff, 0xfe], "utf-16le"],
  [[0xfe, 0xff], "utf-16be"],
];

const startsWithBytes = (buffer: Buffer, bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);

/** UTF-16 without a byte-order mark: subtitle timestamps are ASCII, so every other byte is zero. */
const bomlessUtf16 = (buffer: Buffer): string | null => {
  const sample = buffer.subarray(0, 4096);
  const pairs = Math.floor(sample.length / 2);
  if (pairs < 8) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index + 1 < sample.length; index += 2) {
    if (sample[index] === 0) evenZeros++;
    if (sample[index + 1] === 0) oddZeros++;
  }
  if (oddZeros > pairs * 0.3 && evenZeros < pairs * 0.05) return "utf-16le";
  if (evenZeros > pairs * 0.3 && oddZeros < pairs * 0.05) return "utf-16be";
  return null;
};

const strictUtf8 = new TextDecoder("utf-8", {fatal: true});
const CENTRAL_OR_BALTIC = /^(windows-125[07]|ISO-8859-(2|4|13))$/;

/**
 * Decodes subtitle bytes. A byte-order mark wins, then UTF-16 without one, then strict UTF-8,
 * then chardet's guess (Shift_JIS, EUC-JP, GB18030, Big5, EUC-KR, windows-125x, ...). Encodings
 * iconv-lite cannot decode fall back to windows-1252, which maps every byte, so this never throws.
 */
export const decodeText = (buffer: Buffer): { text: string; encoding: string } => {
  const bom = BYTE_ORDER_MARKS.find(([bytes]) => startsWithBytes(buffer, bytes));
  if (bom) return {text: iconv.decode(buffer, bom[1]), encoding: bom[1]};

  const utf16 = bomlessUtf16(buffer);
  if (utf16) return {text: iconv.decode(buffer, utf16), encoding: utf16};

  try {
    return {text: strictUtf8.decode(buffer), encoding: "utf-8"};
  } catch {
    // Not valid UTF-8; guess a legacy encoding below.
  }

  const candidates = analyse(buffer).filter((candidate) => iconv.encodingExists(candidate.name));
  let encoding = candidates[0]?.name ?? "windows-1252";
  // Short Western text often scores a little higher as Central European or Baltic; prefer
  // windows-1252 when it is nearly as likely (French "déjà" otherwise decodes as "déjŕ").
  const western = candidates.find((candidate) => candidate.name === "windows-1252");
  if (western && CENTRAL_OR_BALTIC.test(encoding) && western.confidence >= candidates[0].confidence * 0.75) {
    encoding = western.name;
  }
  return {text: iconv.decode(buffer, encoding), encoding};
};
