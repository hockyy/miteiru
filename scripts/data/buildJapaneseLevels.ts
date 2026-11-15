/**
 * Regenerate the Japanese JLPT levels and word frequencies the language tools read:
 * renderer/public/study-data/japanese-levels/words.json, with the CC BY-SA 4.0 licence and wordfreq's
 * notice beside it. The README there names the sources.
 *
 *   npx tsx scripts/data/buildJapaneseLevels.ts
 *
 * Both sources are pinned to a commit and their licence text is checked before anything is written.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

/** stephenmk/yomitan-jlpt-vocab: Jonathan Waller's JLPT lists with JMdict entry ids (CC BY-SA 4.0). */
export const JLPT_SOURCE_COMMIT = 'b062d4e38c4bdd0950ae1d4ec55f04b176182e03';
/** rspeer/wordfreq v3.2: its data files are CC BY-SA 4.0 (the code is Apache-2.0). */
export const WORDFREQ_SOURCE_COMMIT = '42233e6c36ce792031bcccfa17cdd0cec9af5fa7';
/** Words seen less than once per million (Zipf 3) are left out. */
export const ZIPF_MIN = 3;

const jlptSource = `https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/${JLPT_SOURCE_COMMIT}/`;
const wordfreqSource = `https://raw.githubusercontent.com/rspeer/wordfreq/${WORDFREQ_SOURCE_COMMIT}/`;

/** The msgpack subset wordfreq's .msgpack files use: arrays, maps, strings, integers, nil and booleans. */
export const decodeMsgpack = (bytes: Uint8Array): unknown => {
  let at = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder('utf-8', {fatal: true});
  const need = (count: number) => {
    if (at + count > bytes.length) throw new Error(`msgpack: truncated at byte ${at}`);
  };
  const str = (length: number) => {
    need(length);
    const value = text.decode(bytes.subarray(at, at + length));
    at += length;
    return value;
  };
  const uint = (size: 1 | 2 | 4) => {
    need(size);
    const value = size === 1 ? view.getUint8(at) : size === 2 ? view.getUint16(at) : view.getUint32(at);
    at += size;
    return value;
  };
  const int = (size: 1 | 2 | 4) => {
    need(size);
    const value = size === 1 ? view.getInt8(at) : size === 2 ? view.getInt16(at) : view.getInt32(at);
    at += size;
    return value;
  };
  const array = (length: number): unknown[] => Array.from({length}, read);
  const map = (length: number) => Object.fromEntries(Array.from({length}, () => [String(read()), read()]));
  function read(): unknown {
    need(1);
    const byte = bytes[at++];
    if (byte <= 0x7f) return byte;
    if (byte >= 0xe0) return byte - 0x100;
    if ((byte & 0xe0) === 0xa0) return str(byte & 0x1f);
    if ((byte & 0xf0) === 0x90) return array(byte & 0x0f);
    if ((byte & 0xf0) === 0x80) return map(byte & 0x0f);
    switch (byte) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return uint(1);
      case 0xcd: return uint(2);
      case 0xce: return uint(4);
      case 0xd0: return int(1);
      case 0xd1: return int(2);
      case 0xd2: return int(4);
      case 0xd9: return str(uint(1));
      case 0xda: return str(uint(2));
      case 0xdb: return str(uint(4));
      case 0xdc: return array(uint(2));
      case 0xdd: return array(uint(4));
      case 0xde: return map(uint(2));
      case 0xdf: return map(uint(4));
      default: throw new Error(`msgpack: type 0x${byte.toString(16)} at byte ${at - 1} is not used by wordfreq`);
    }
  }
  const value = read();
  if (at !== bytes.length) throw new Error(`msgpack: ${bytes.length - at} bytes after the value`);
  return value;
};

/** A word worth a rank: it has kana or kanji, and no digits (wordfreq writes every digit as 0). */
const isJapaneseWord = (word: string) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(word) && !/[0-9]/.test(word);

/**
 * wordfreq's cBpack (a header, then one list of words per centibel of frequency, most frequent first)
 * as [centibels, words] pairs: Japanese words only, at least `zipfMin`, empty buckets dropped.
 */
export const compactFrequency = (pack: unknown, zipfMin = ZIPF_MIN): Array<[number, string[]]> => {
  if (!Array.isArray(pack) || pack.length < 1) throw new Error('wordfreq: not a cBpack');
  const [header, ...buckets] = pack;
  const format = header as {format?: unknown; version?: unknown};
  if (format?.format !== 'cB' || format?.version !== 1) throw new Error(`wordfreq: unknown header ${JSON.stringify(header)}`);
  const lowest = Math.round((9 - zipfMin) * 100);
  const out: Array<[number, string[]]> = [];
  for (const [centibels, bucket] of buckets.entries()) {
    if (centibels > lowest) break;
    if (!Array.isArray(bucket)) throw new Error(`wordfreq: bucket ${centibels} is not a list`);
    const words = bucket.filter((word): word is string => typeof word === 'string' && isJapaneseWord(word));
    if (words.length) out.push([centibels, words]);
  }
  return out;
};

/** One CSV line's fields (RFC 4180 quoting). */
export const csvFields = (line: string): string[] => {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < line.length; at++) {
    const char = line[at];
    if (quoted) {
      if (char === '"' && line[at + 1] === '"') {
        field += '"';
        at++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
};

export type JlptRow = [number, number, string, string];

/**
 * The lists' rows (n1.csv … n5.csv: jmdict_seq, kana, kanji, waller_definition) as
 * [entry id or 0, level, kanji or "", kana]. Definitions are not copied. A word listed twice with the
 * same entry, spelling and reading keeps its easiest level.
 */
export const compactJlptRows = (csvByLevel: Record<number, string>): JlptRow[] => {
  const rows = new Map<string, JlptRow>();
  for (const [levelText, csv] of Object.entries(csvByLevel)) {
    const level = Number(levelText);
    const lines = csv.split(/\r?\n/).filter((line) => line.trim());
    if (lines[0]?.trim() !== 'jmdict_seq,kana,kanji,waller_definition') throw new Error(`n${level}.csv: unexpected header ${lines[0]}`);
    for (const line of lines.slice(1)) {
      const [id, kana, kanji] = csvFields(line).map((field) => field.trim().normalize('NFC'));
      if (!kana) continue;
      const entry = /^\d+$/.test(id) ? Number(id) : 0;
      const key = `${entry}\t${kanji}\t${kana}`;
      const existing = rows.get(key);
      if (!existing || existing[1] < level) rows.set(key, [entry, level, kanji ?? '', kana]);
    }
  }
  return [...rows.values()].sort((a, b) => b[1] - a[1] || a[0] - b[0] || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
};

const build = async () => {
  const download = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const levels = [1, 2, 3, 4, 5];
  const [jlptLicense, wordfreqNotice, packed, ...csvs] = await Promise.all([
    download(`${jlptSource}LICENSE.txt`),
    download(`${wordfreqSource}NOTICE.md`),
    download(`${wordfreqSource}wordfreq/data/large_ja.msgpack.gz`),
    ...levels.map((level) => download(`${jlptSource}original_data/n${level}.csv`))
  ]);
  const licenseText = jlptLicense.toString('utf8');
  const noticeText = wordfreqNotice.toString('utf8');
  if (!licenseText.startsWith('Attribution-ShareAlike 4.0 International')) {
    throw new Error('Check the JLPT lists\' licence (stephenmk/yomitan-jlpt-vocab LICENSE.txt) before regenerating.');
  }
  if (!noticeText.includes('Creative Commons Attribution-ShareAlike 4.0') || !noticeText.includes('Robyn Speer')) {
    throw new Error('Check wordfreq\'s NOTICE.md (its data licence and attribution terms) before regenerating.');
  }
  const jlpt = compactJlptRows(Object.fromEntries(levels.map((level, index) => [level, csvs[index].toString('utf8')])));
  const frequency = compactFrequency(decodeMsgpack(zlib.gunzipSync(packed)));
  const words = {
    meta: {
      format: 2,
      jlpt: {
        source: 'https://github.com/stephenmk/yomitan-jlpt-vocab',
        commit: JLPT_SOURCE_COMMIT,
        basedOn: 'Jonathan Waller, JLPT Resources, http://www.tanos.co.uk/jlpt/ (CC BY)',
        license: 'CC BY-SA 4.0'
      },
      frequency: {
        source: 'https://github.com/rspeer/wordfreq (wordfreq 3.2, large_ja), by Robyn Speer',
        commit: WORDFREQ_SOURCE_COMMIT,
        license: 'CC BY-SA 4.0',
        zipfMin: ZIPF_MIN
      }
    },
    jlpt,
    frequency
  };
  const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../renderer/public/study-data/japanese-levels');
  await fs.mkdir(output, {recursive: true});
  const json = `${JSON.stringify(words)}\n`;
  await fs.writeFile(path.join(output, 'words.json'), json);
  await fs.writeFile(path.join(output, 'LICENSE'), licenseText);
  await fs.writeFile(path.join(output, 'NOTICE-wordfreq.md'), noticeText);
  const ranked = frequency.reduce((count, [, list]) => count + list.length, 0);
  console.log(`Japanese levels: ${jlpt.length} JLPT rows, ${ranked} ranked words, ${Buffer.byteLength(json)} bytes`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((error) => {console.error(error); process.exitCode = 1;});
}
