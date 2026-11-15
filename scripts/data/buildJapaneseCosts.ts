/*
 * Builds native/rust/crates/miteiru-tokenizer/data/ipadic-costs.tsv: word costs for IPADIC entries
 * taken from the pyopenjtalk-plus dictionary, which the Japanese tokenizer applies when it loads.
 *
 *   npx tsx scripts/data/buildJapaneseCosts.ts --plus <sys.dic> [--ipadic <dir>] [--out <file>]
 *
 * <sys.dic> is pyopenjtalk/dictionary/sys.dic from the pyopenjtalk-plus 0.4.1.post10 wheel
 * (`pip download pyopenjtalk-plus==0.4.1.post10 --no-deps`, then unzip that one file). <dir> holds
 * IPADIC in kuromoji's layout (default: the checkout's renderer/public/language-assets/japanese/dict).
 *
 * pyopenjtalk-plus maintains a dictionary that descends from IPADIC through NAIST-jdic, with years of
 * cost audits and reading fixes (日本 にほん over にっぽん, 日本酒 as one word, 後 あと over のち). Measured
 * on the reading gold set (tests/fixtures/japanese-readings) and the JVS kana benchmark, its readings
 * beat IPADIC's by far; switching dictionaries would double the tokenizer's size and need a new
 * language pack, so this carries its judgement over to the entries IPADIC already has. The plus
 * dictionary's costs are on IPADIC's scale after subtracting the median difference (-188).
 *
 * - The reading the plus dictionary prefers for a surface (its cheapest as an ordinary word, else its
 *   cheapest) may get cheaper and the others dearer, never the other way: an entry both dictionaries
 *   have takes the plus dictionary's cost when that moved by more than THRESHOLD in that direction.
 * - Where one part of speech has several readings and the two dictionaries make a different one the
 *   cheapest, the plus dictionary's (if it is the preferred one) becomes just cheaper than the rest.
 * - A reading the plus dictionary dropped (夜中 ヤチュウ, the prefix 今 コン, 剥がす へがす) costs
 *   DROPPED more.
 *
 * Left alone, because the plus dictionary segments them its own way: words without kanji and
 * function words (it has no として or 後で as one entry), suffixes and numerals (it tunes them with
 * compounds IPADIC lacks: 人 ジン is a nationality suffix there), numeral + counter words (Miteiru's
 * learner units keep 三 / 人 apart and read them with the counter rules), a preferred reading the plus
 * dictionary made dearer (元日 and 君 would split or lose their reading), and one-kanji country names
 * (IPADIC builds 日米 from 米).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const THRESHOLD = 1000;
const DROPPED = 10000;

const HAN = /[\p{Script=Han}々〆ヶ]/u;
const ALL_HAN = /^[\p{Script=Han}々〆ヶ]+$/u;
const FUNCTION_WORD = /^(助詞|助動詞|記号|フィラー|感動詞|その他)/;
const BOUND = /^名詞,(接尾|数)/;
const NUMERAL = /^[〇一二三四五六七八九十百千万億兆]+/u;
const COUNTERS = new Set([
  "人", "日", "本", "杯", "階", "歳", "才", "円", "個", "回", "枚", "匹", "年", "月", "時", "分", "秒", "度", "番", "台", "冊",
  "着", "足", "軒", "件", "通", "点", "頭", "羽", "名", "倍", "割", "号", "代", "泊", "週", "晩", "缶", "箱", "曲", "局", "歩",
  "発", "敗", "勝", "戦", "位", "席", "社", "校", "機", "隻", "粒", "袋", "束", "間", "色", "種", "品", "票", "店", "時間",
  "日間", "年間", "週間", "分間", "秒間", "か月", "ヶ月", "カ月", "ケ月", "箇月", "箇所", "か所", "ヶ所", "カ所", "つ", "つ目",
  "人目", "日目", "年目", "回目", "番目", "個目", "杯目", "本目", "枚目", "度目", "人分", "日分", "年生", "世紀", "年代", "次元"
]);

type Key = string; // surface \t part of speech (6 fields) \t reading

const counted = (surface: string) => {
  const rest = surface.replace(NUMERAL, "");
  return rest !== surface && COUNTERS.has(rest);
};

const nulTerminated = (buffer: Buffer, offset: number) => {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end++;
  return buffer.toString("utf8", offset, end);
};

/** IPADIC in kuromoji's layout: tid (10-byte entries), tid_pos (features, surface first), tid_map. */
export const readIpadic = (directory: string) => {
  const read = (name: string) => zlib.gunzipSync(fs.readFileSync(path.join(directory, `${name}.dat.gz`)));
  const [tid, features, map] = [read("tid"), read("tid_pos"), read("tid_map")];
  const entries = new Map<Key, number>();
  const seen = new Set<number>();
  let cursor = 4;
  for (let key = 0, count = map.readUInt32LE(0); key < count; key++) {
    const length = map.readUInt32LE(cursor + 4);
    cursor += 8;
    for (let index = 0; index < length; index++, cursor += 4) {
      const id = map.readUInt32LE(cursor);
      if (seen.has(id)) continue;
      seen.add(id);
      const fields = nulTerminated(features, tid.readUInt32LE(id + 6)).split(",");
      const entry = `${fields[0]}\t${fields.slice(1, 7).join(",")}\t${fields[8]}`;
      const cost = tid.readInt16LE(id + 4);
      if (!entries.has(entry) || entries.get(entry)! > cost) entries.set(entry, cost);
    }
  }
  return entries;
};

/** A MeCab sys.dic: header, Darts double array (8-byte units), 16-byte tokens, features. */
export const readMecab = (file: string) => {
  const dic = fs.readFileSync(file);
  const [dsize, tsize] = [24, 28].map((offset) => dic.readUInt32LE(offset));
  const arrayStart = 72;
  const units = dsize / 8;
  const base = (index: number) => dic.readInt32LE(arrayStart + index * 8);
  const check = (index: number) => dic.readUInt32LE(arrayStart + index * 8 + 4);
  const entries = new Map<Key, number>();
  const stack: Array<[number, number[]]> = [[base(0), []]];
  while (stack.length) {
    const [node, bytes] = stack.pop()!;
    if (node >= 0 && node < units && check(node) === node && base(node) < 0) {
      const value = -base(node) - 1;
      const surface = Buffer.from(bytes).toString("utf8");
      for (let token = value >>> 8, end = (value >>> 8) + (value & 0xff); token < end; token++) {
        const at = arrayStart + dsize + token * 16;
        const fields = nulTerminated(dic, arrayStart + dsize + tsize + dic.readUInt32LE(at + 8)).split(",");
        const entry = `${surface}\t${fields.slice(0, 6).join(",")}\t${fields[7]}`;
        const cost = dic.readInt16LE(at + 6);
        if (!entries.has(entry) || entries.get(entry)! > cost) entries.set(entry, cost);
      }
    }
    for (let byte = 0; byte < 256; byte++) {
      const child = node + byte + 1;
      if (child > 0 && child < units && check(child) === node) stack.push([base(child), [...bytes, byte]]);
    }
  }
  return entries;
};

export const buildCosts = (ipadic: Map<Key, number>, plus: Map<Key, number>) => {
  const deltas = [...ipadic].filter(([key]) => plus.has(key)).map(([key, cost]) => plus.get(key)! - cost).sort((a, b) => a - b);
  const shift = deltas[Math.floor(deltas.length / 2)];
  const split = (key: Key) => key.split("\t") as [string, string, string];
  const groups = new Map<string, Key[]>();
  for (const key of ipadic.keys()) {
    const [surface, pos] = split(key);
    groups.set(`${surface}\t${pos}`, [...(groups.get(`${surface}\t${pos}`) ?? []), key]);
  }
  const plusGroups = new Set([...plus.keys()].map((key) => split(key).slice(0, 2).join("\t")));
  const plusReadings = new Set([...plus.keys()].map((key) => {
    const [surface, pos, reading] = split(key);
    return `${surface}\t${pos.split(",")[0]}\t${reading}`;
  }));
  const cheapest = (members: Key[], cost: (key: Key) => number) => members.reduce((best, key) => (cost(key) < cost(best) ? key : best));
  // The reading the plus dictionary prefers for a surface in one major part of speech: its cheapest
  // as an ordinary word (not a suffix, numeral, prefix or name, whose costs sit on other scales: 角
  // is かど, 金 かね), or its cheapest at all when it has no ordinary entry (日本 にほん).
  const ORDINARY = /^(名詞,(一般|副詞可能|形容動詞語幹|サ変接続|代名詞|ナイ形容詞語幹)|動詞|形容詞|副詞|連体詞)/;
  const major = (pos: string) => pos.split(",")[0];
  const preferred = new Map<string, {reading: string; cost: number; ordinary: boolean}>();
  for (const [key, cost] of plus) {
    const [surface, pos, reading] = split(key);
    const slot = `${surface}\t${major(pos)}`;
    const ordinary = ORDINARY.test(pos);
    const best = preferred.get(slot);
    if (!best || (ordinary && !best.ordinary) || (ordinary === best.ordinary && cost < best.cost)) {
      preferred.set(slot, {reading, cost, ordinary});
    }
  }
  const isPreferred = (surface: string, pos: string, reading: string) => {
    const best = preferred.get(`${surface}\t${major(pos)}`);
    return !best || best.reading === reading;
  };
  // Groups whose cheapest reading differs between the dictionaries, where the plus dictionary's is
  // also the one it prefers for the surface (皆 is みな there as an adverbial noun, so the pronoun
  // group's ミンナ is not taken): that reading takes over, cheaper just enough.
  const reorderedTo = (surface: string, pos: string) => {
    const members = groups.get(`${surface}\t${pos}`) ?? [];
    if (members.length < 2 || !members.every((member) => plus.has(member))) return undefined;
    const theirs = cheapest(members, (member) => plus.get(member)!);
    if (theirs === cheapest(members, (member) => ipadic.get(member)!) || !isPreferred(surface, pos, split(theirs)[2])) return undefined;
    return {key: theirs, below: Math.min(...members.map((member) => ipadic.get(member)!)) - 1};
  };
  const costs: Array<[Key, number]> = [];
  for (const [key, cost] of ipadic) {
    const [surface, pos, reading] = split(key);
    if (!HAN.test(surface) || FUNCTION_WORD.test(pos) || BOUND.test(pos) || counted(surface)) continue;
    if (plus.has(key)) {
      const target = Math.max(-32768, Math.min(32767, plus.get(key)! - shift));
      const reorder = reorderedTo(surface, pos);
      if (reorder) {
        if (reorder.key === key) costs.push([key, Math.min(target, reorder.below)]);
        continue;
      }
      // Only the preferred reading gets cheaper and only the others get dearer (後 あと cheaper and
      // のち dearer; the surname 金 キム dearer). A preferred reading never gets dearer: the plus
      // dictionary raises one where it lists the compounds around it whole (元日 there is a common
      // noun, here a proper one that 元 + 日 would beat; 君 きみ). Nor does a one-kanji country
      // name, which IPADIC builds compounds from (日米).
      const mine = isPreferred(surface, pos, reading);
      const country = Array.from(surface).length === 1 && pos.startsWith("名詞,固有名詞,地域,国");
      if (target < cost ? !mine : mine || country) continue;
      if (Math.abs(target - cost) > THRESHOLD) costs.push([key, target]);
      continue;
    }
    // Dropped: no entry with this reading in the same major part of speech (the plus dictionary
    // refiles readings within one: 人 ジン is 名詞,接尾,地域 there). A surface with kana counts only
    // when the plus dictionary still has it in this part of speech (剥がさ without ヘガサ).
    const refiled = plusReadings.has(`${surface}\t${pos.split(",")[0]}\t${reading}`);
    if (!refiled && (ALL_HAN.test(surface) || plusGroups.has(`${surface}\t${pos}`))) {
      costs.push([key, Math.min(32767, cost + DROPPED)]);
    }
  }
  costs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {shift, costs};
};

const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const option = (name: string, fallback?: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const root = path.resolve(__dirname, "..", "..");
  const plusFile = option("--plus");
  if (!plusFile) throw new Error("Usage: npx tsx scripts/data/buildJapaneseCosts.ts --plus <pyopenjtalk-plus sys.dic> [--ipadic <dir>] [--out <file>]");
  const ipadicDir = option("--ipadic", path.join(root, "renderer/public/language-assets/japanese/dict"))!;
  const out = option("--out", path.join(root, "native/rust/crates/miteiru-tokenizer/data/ipadic-costs.tsv"))!;
  const {shift, costs} = buildCosts(readIpadic(ipadicDir), readMecab(plusFile));
  const partsOfSpeech = [...new Set(costs.map(([key]) => key.split("\t")[1]))].sort();
  const index = new Map(partsOfSpeech.map((pos, at) => [pos, at]));
  const lines = [
    "# Word costs for IPADIC entries from the pyopenjtalk-plus 0.4.1.post10 dictionary (see ../NOTICE).",
    "# Made by scripts/data/buildJapaneseCosts.ts, which says what is carried over and why. Do not edit.",
    `# sys.dic sha256 ${sha256(plusFile)}; IPADIC tid.dat.gz sha256 ${sha256(path.join(ipadicDir, "tid.dat.gz"))}; median shift ${shift}.`,
    "# @ lines: parts of speech (part, details 1-3, conjugation type, form), numbered from 0.",
    "# Other lines: surface, reading, part-of-speech number, cost.",
    ...partsOfSpeech.map((pos) => `@${pos}`),
    ...costs.map(([key, cost]) => {
      const [surface, pos, reading] = key.split("\t");
      return `${surface}\t${reading}\t${index.get(pos)}\t${cost}`;
    })
  ];
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(`${costs.length} costs, ${partsOfSpeech.length} parts of speech -> ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KiB)`);
}
