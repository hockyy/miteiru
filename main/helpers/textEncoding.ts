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

// iconv-lite lacks a few encodings chardet reports (ISO-2022-JP); the platform TextDecoder has them.
const textDecoderSupports = (encoding: string) => {
  try {
    new TextDecoder(encoding);
    return true;
  } catch {
    return false;
  }
};

const canDecode = (encoding: string) => iconv.encodingExists(encoding) || textDecoderSupports(encoding);

const decodeWith = (buffer: Buffer, encoding: string) => (
  iconv.encodingExists(encoding) ? iconv.decode(buffer, encoding) : new TextDecoder(encoding).decode(buffer)
);

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
const lenientUtf8 = new TextDecoder("utf-8");
const ISO_2022_JP_SWITCH = Buffer.from([0x1b, 0x24]);
// chardet only needs a prefix to recognise an encoding.
const DETECTION_SAMPLE_BYTES = 64 * 1024;
const CENTRAL_OR_BALTIC = /^(windows-125[07]|ISO-8859-(2|4|13))$/;

/**
 * Decodes subtitle bytes. A byte-order mark wins, then UTF-16 without one, then UTF-8 (also with
 * a stray bad byte), then chardet's guess (Shift_JIS, EUC-JP, ISO-2022-JP, GB18030, Big5, EUC-KR,
 * windows-125x, ...). Without a decodable guess it uses windows-1252, which maps every byte, so
 * this never throws.
 */
export const decodeText = (buffer: Buffer): { text: string; encoding: string } => {
  const bom = BYTE_ORDER_MARKS.find(([bytes]) => startsWithBytes(buffer, bytes));
  if (bom) return {text: iconv.decode(buffer, bom[1]), encoding: bom[1]};

  const utf16 = bomlessUtf16(buffer);
  if (utf16) return {text: iconv.decode(buffer, utf16), encoding: utf16};

  // ISO-2022-JP is 7-bit, so it also passes as UTF-8; its ESC $ switch into JIS X 0208 gives it away.
  if (buffer.includes(ISO_2022_JP_SWITCH) && textDecoderSupports("iso-2022-jp")) {
    return {text: new TextDecoder("iso-2022-jp").decode(buffer), encoding: "iso-2022-jp"};
  }

  try {
    return {text: strictUtf8.decode(buffer), encoding: "utf-8"};
  } catch {
    // Not valid UTF-8; it may still be UTF-8 with a stray bad byte.
  }

  // Real UTF-8 with a few corrupt bytes still decodes multibyte characters; a legacy code page
  // read as UTF-8 yields only ASCII and replacement characters, or a great many of the latter.
  const lenient = lenientUtf8.decode(buffer);
  const replacements = lenient.split("\uFFFD").length - 1;
  if (/[^\x00-\x7F\uFFFD]/.test(lenient) && replacements <= Math.max(2, lenient.length / 1000)) {
    return {text: lenient, encoding: "utf-8"};
  }

  const candidates = analyse(buffer.subarray(0, DETECTION_SAMPLE_BYTES)).filter((candidate) => canDecode(candidate.name));
  let encoding = candidates[0]?.name ?? "windows-1252";
  // Short Western text often scores a little higher as Central European or Baltic; prefer
  // windows-1252 when it is nearly as likely (French "déjà" otherwise decodes as "déjŕ").
  const western = candidates.find((candidate) => candidate.name === "windows-1252");
  if (western && CENTRAL_OR_BALTIC.test(encoding) && western.confidence >= candidates[0].confidence * 0.75) {
    encoding = western.name;
  }
  return {text: decodeWith(buffer, encoding), encoding};
};
