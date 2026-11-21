// At the repo root: npx tsx scripts/data/checkPinyinPro.ts [path/to/reference/node_modules/pinyin-pro]
// To rebuild after removal, npm install --prefix <temp> --ignore-scripts pinyin-pro@3.29.3 opencc-js@1.4.1
// and pass <temp>/node_modules/pinyin-pro. The reference also supplies the original OpenCC input.
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {sentencePinyin} from "../../main/handler/chinese";
import {convertPinyinBatch, fullPinyinBatch, pinyinReadingsBatch, type PinyinItem} from "../../main/language/pinyin";
import {toPinyinToneMarks} from "../../main/handler/pinyinTones";
import {chineseReadingCorpus} from "./chineseReadingCorpus";

const referenceDir = path.resolve(process.argv[2] ?? "node_modules/pinyin-pro");
const metadata = path.join(referenceDir, "package.json");
const {name, version} = JSON.parse(fs.readFileSync(metadata, "utf8"));
assert.equal(`${name}@${version}`, "pinyin-pro@3.29.3");
const load = createRequire(metadata);
const reference: {
  convert(text: string, options: {format: "numToSymbol" | "symbolToNum"}): string;
  pinyin(text: string, options: {type: "all"; toneType: "num"}): PinyinItem[];
} = load(referenceDir);
const simplify: (text: string) => string = load("opencc-js/t2cn").Converter({from: "t", to: "cn"});
const options = {type: "all", toneType: "num"} as const;

type Item = PinyinItem;
const items: Item[] = [];
const itemIds = new Map<string, number>();
const cases: Array<{text: string; items: number[]; simplifiedReadings?: string[]}> = [];
const conversions = new Map<string, {input: string; marked: string; numbered: string}>();
let pinyinChecks = 0;
let conversionChecks = 0;

async function checkPinyin(texts: string[]) {
  const full = await fullPinyinBatch(texts);
  const numbers = await pinyinReadingsBatch(texts);
  const marks = await pinyinReadingsBatch(texts, "symbol");
  return texts.map((text, i) => {
    const expected = reference.pinyin(text, options);
    assert.deepEqual(full[i], expected, text);
    assert.deepEqual(numbers[i], expected.map(item => item.pinyin), text);
    assert.deepEqual(marks[i], expected.map(item => reference.convert(item.pinyin, {format: "numToSymbol"})), text);
    pinyinChecks++;
    return expected;
  });
}

async function checkConvert(input: string, keep: boolean) {
  const marked = reference.convert(input, {format: "numToSymbol"});
  const numbered = reference.convert(input, {format: "symbolToNum"});
  assert.equal((await convertPinyinBatch([input], "numToSymbol"))[0], marked, input);
  assert.equal(toPinyinToneMarks(input), marked.replace(/[05]$/, ""), input);
  assert.equal((await convertPinyinBatch([input], "symbolToNum"))[0], numbered, input);
  conversionChecks += 2;
  if (keep) conversions.set(input, {input, marked, numbered});
  return marked;
}

// Intern identical reference objects so even the long-line fixture fits under 1 MB.
function itemId(item: Item) {
  const key = JSON.stringify(item);
  const existing = itemIds.get(key);
  if (existing !== undefined) return existing;
  const id = items.push(item) - 1;
  itemIds.set(key, id);
  return id;
}

async function check() {
  const corpus = chineseReadingCorpus();
  const edges = [
    "", "嗎吗了々", "我吃了饭。", "我們吃了飯，什麼時候去銀行？", "今天重庆的银行行长要听音乐。",
    "今天重慶的銀行行長要聽音樂。", "什么？不了，了解了。", "看一看，第一行不行？不對不對。",
    "一十一行行不行，别别的曲别针。", "物以稀为贵，成吉思汗。", "了𠮷々𬺓々🙂A\ud800Z\udc00",
    "English, １２３ 和 かな🙂\n漢字。", "女绿略虐嗯哼欸誒", "朝朝朝落，干一行爱一行。",
  ];
  const lines = [...corpus, ...edges];
  const fallbackChars = new Set<string>();
  for (const [index, text] of lines.entries()) {
    const chars = Array.from(text);
    for (const char of chars) fallbackChars.add(char);
    const [raw] = await checkPinyin([text]);
    const simplified = simplify(text);
    const useCopy = simplified !== text && Array.from(simplified).length === chars.length;
    const sentence = useCopy
      ? (await checkPinyin([simplified]))[0].map((item, i) => ({origin: chars[i], pinyin: item.pinyin}))
      : raw;
    assert.deepEqual(await sentencePinyin(text), sentence, text);
    for (const mode of ["num", "symbol"] as const) {
      const expected = sentence.map(({origin, pinyin}) => ({origin,
        pinyin: mode === "num" ? pinyin : reference.convert(pinyin, {format: "numToSymbol"})}));
      assert.deepEqual(await sentencePinyin(text, mode), expected, text);
    }
    const keep = index % 41 === 0 || index >= corpus.length || chars.length > 1024;
    if (keep) {
      cases.push({text, items: raw.map(itemId), ...(useCopy ? {simplifiedReadings: sentence.map(item => item.pinyin)} : {})});
    }
    await checkConvert(text, keep);
    const numbers = sentence.map(item => item.pinyin).join(" ");
    await checkConvert(await checkConvert(numbers, keep), keep);
  }

  // The character fallback and all of the original package's dictionary inputs, including astral entries.
  const dict1: {NumberDICT: string[]; StringDICT: Map<string, string>} = load("./dist/esm/data/dict1.mjs").default;
  dict1.NumberDICT.forEach((_, code) => fallbackChars.add(String.fromCharCode(code)));
  for (const char of dict1.StringDICT.keys()) fallbackChars.add(char);

  const {PatternsNormal}: {PatternsNormal: Array<{zh: string}>} = load("./dist/esm/data/patterns.mjs");
  const dictionary = [...fallbackChars, ...PatternsNormal.map(pattern => pattern.zh)];
  for (let i = 0; i < dictionary.length; i += 256) await checkPinyin(dictionary.slice(i, i + 256));

  for (const input of [
    "", " ", "  nǐ  hǎo ", "ni3 hao3 ma0 ma5", "lü4 lv4 lu:4 nü3 lüe4", "shuǐ liú yuè",
    "dian3r diǎnr er2 ér èr", "n1 n2 n3 n4 m1 m2 m3 m4 ê1 ê2 ê3 ê4", "n̄ ń ň ǹ m̄ ḿ m̌ m̀ ê̄ ế ê̌ ề",
    "ḿ̌ ê̄̌ m̄̀ ń̄", "4D MIXED123?!…🙂 拼音", "nǐ\thǎo\n", "Chóngqìng chóng qìng",
  ]) await checkConvert(input, true);

  const fixture = JSON.stringify({items, cases, conversions: [...conversions.values()]}, null, 2) + "\n";
  assert.ok(Buffer.byteLength(fixture) < 1_000_000);
  fs.mkdirSync("tests/fixtures/in-house", {recursive: true});
  fs.writeFileSync("tests/fixtures/in-house/pinyin-pro.json", fixture);
  console.log(`${lines.length} lines, ${pinyinChecks} pinyin calls, ${conversionChecks} tone conversions, 0 differences`);
}
void check();
