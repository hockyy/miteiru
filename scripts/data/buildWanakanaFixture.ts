/**
 * Compare every corpus input with the published package, then save all the edge
 * cases and a deterministic sample of the corpus. To rebuild after uninstall:
 *
 *   npm install --prefix <scratch-directory> --no-save --package-lock=false wanakana@5.3.1
 *   npx tsx scripts/data/buildWanakanaFixture.ts <scratch-directory>
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import * as port from "../../main/language/wanakana";

const fixtures = path.resolve(__dirname, "../../tests/fixtures");

export function wanakanaOutputs(api: typeof port, input: string) {
  return {
    toRomaji: api.toRomaji(input),
    toHiragana: api.toHiragana(input),
    toHiraganaKeepLongMark: api.toHiragana(input, {convertLongVowelMark: false}),
    toKatakana: api.toKatakana(input),
    toKatakanaPassRomaji: api.toKatakana(input, {passRomaji: true}),
    isHiragana: api.isHiragana(input),
    isKatakana: api.isKatakana(input),
    isKana: api.isKana(input),
    isKanji: api.isKanji(input),
    isMixed: api.isMixed(input),
  };
}

const edgeCases = new Set([
  "", " ", "\t\n", "123", "０１２３", "English", "Tōkyō and Ōsaka", "ĀĒĪŌŪ āēīōū", "ＡＢＣ",
  "!?.,:/~-‘’“”[](){}", "！？。：・、〜ー「」『』［］（）｛｝　", "“猫”", ".漢ABC",
  "😀🚀", "𠮷", "𠮷野家", "々", "一", "龯", "龰", "㐀", "﨑", "a漢", "お腹A", "Aあア",
  "𠮷😀キャABC42！", "😁ー", "ｺｰﾋｰ", "か\u3099", "ウ\u3099ァ", "İカ", "２あア",
  "ラーメン", "缶コーヒー", "スーパー", "げーむ　ゲーム", "ーアイ", "アーイーウーエーオー",
  "オーー", "コ・ー", "オヶー", "カーaー", "ンー", "ッー", "ヵヶヷヸヹヺ",
  "きゃしゃちゃじゃぢゃ", "しぃじぇちぃぢぇ", "ぁぃぅぇぉっゃゅょゎゕゖ",
  "ゔ", "ゔぁ", "ゔぃ", "ゔぇ", "ゔぉ", "ティ", "ディ", "ファ", "フィ", "フェ", "フォ", "ヴァ",
  "ヴォ", "ヴュ", "トゥ", "シェ", "ツァ", "クヮ", "ティーファヴァ", "ッティッファッヴァ",
  "っちゃ", "っしゅ", "っつ", "っぎゃ", "っじぃ", "っぃ", "っっ", "末っ", "ッ.", "っ𠮷",
  "きんにくまん", "んんにんにんにゃんやん", "nn", "n", "n'", "xn", "nnya", "n'a",
  "WANI kani", "xtu ltsu xtsu ltu xka lke", "chyu shy jy cyi fu kwa whu",
  "tha thi thu the tho dha dhi dhu dhe dho", "wi we wu yi ye",
  "っ".repeat(12) + "きゃ", "スーパーで食べた。".repeat(192),
]);

// Each kana on its own and after small tsu, including archaic and small letters.
for (let code = 0x3040; code <= 0x30ff; code++) {
  const kana = String.fromCharCode(code);
  edgeCases.add(kana);
  edgeCases.add((code < 0x30a0 ? "っ" : "ッ") + kana);
}
for (const consonant of "bcdfghjklmnpqrstvwxyz") edgeCases.add("っ" + consonant);
for (const vowel of "あいうえおやゆよアイウエオヤユヨ") {
  edgeCases.add("ん" + vowel);
  edgeCases.add("ン" + vowel);
}
for (const consonant of "bcdfghjklmnpqrstvwxyz") {
  for (const vowel of "aiueo") edgeCases.add(consonant + consonant + vowel);
}

interface CorpusRow {
  text?: string;
  token?: string;
  gold?: string[];
  tokens?: [surface: string, reading?: string | null, alternatives?: string[]][];
}

function lines(file: string): string[] {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(line => line.length > 0);
}

export function wanakanaCorpus(): Set<string> {
  const inputs = new Set(edgeCases);
  const tokenizer = path.join(fixtures, "tokenizer-eval");
  const jsonFiles = fs.readdirSync(tokenizer).filter(name => name.endsWith(".jsonl")).sort()
    .map(name => path.join(tokenizer, name));
  jsonFiles.push(path.join(fixtures, "japanese-readings/gold.jsonl"));
  for (const file of jsonFiles) {
    for (const line of lines(file)) {
      inputs.add(line);
      const row: CorpusRow = JSON.parse(line);
      if (row.text !== undefined) inputs.add(row.text);
      if (row.token !== undefined) inputs.add(row.token);
      if (row.gold) {
        inputs.add(row.gold.join(""));
        for (const token of row.gold) inputs.add(token);
      }
      for (const [surface, reading, alternatives] of row.tokens ?? []) {
        inputs.add(surface);
        if (typeof reading === "string") inputs.add(reading);
        for (const other of alternatives ?? []) inputs.add(other);
      }
    }
  }
  const chinese = path.join(fixtures, "chinese-tokenizer");
  const textFiles = fs.readdirSync(chinese).filter(name => name.endsWith(".txt")).sort()
    .map(name => path.join(chinese, name));
  for (const file of [...textFiles, path.join(fixtures, "japanese-subtitles.txt")]) {
    for (const line of lines(file)) inputs.add(line);
  }
  return inputs;
}

function buildFixture(referenceDir: string) {
  const load = createRequire(path.resolve(referenceDir, "package.json"));
  assert.equal(load("wanakana/package.json").version, "5.3.1");
  const reference: typeof port = load("wanakana");
  const inputs = wanakanaCorpus();
  const rows: string[] = [];
  let index = 0;
  for (const input of inputs) {
    const expected = wanakanaOutputs(reference, input);
    assert.deepEqual(wanakanaOutputs(port, input), expected, JSON.stringify(input));
    if (edgeCases.has(input) || index % 24 === 0) rows.push(JSON.stringify({input, ...expected}));
    index++;
  }
  const file = path.join(fixtures, "in-house/wanakana.json");
  const json = "[\n" + rows.map(row => "  " + row).join(",\n") + "\n]\n";
  assert.ok(Buffer.byteLength(json) < 1_000_000, "fixture must be under 1 MB");
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, json);
  console.log(`${inputs.size} inputs, 0 differences. Saved ${rows.length} fixture rows (${Buffer.byteLength(json)} bytes).`);
}

if (require.main === module) buildFixture(process.argv[2] ?? process.cwd());
