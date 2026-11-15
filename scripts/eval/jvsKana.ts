/**
 * The JVS kana benchmark (Koriyama 2026, "Benchmarking Large Language Models for G2P: A Japanese
 * Case Study", arXiv 2606.22009): 3,000 sentences of the JVS corpus's nonpara30 set with hand-written
 * spoken kana, written apart from Miteiru's gold sets. Its lines were used while designing the
 * readings layer (to find error classes and regressions), so it is a development set now, not a blind test.
 *
 *   npx tsx scripts/eval/jvsKana.ts <jvs_nonpara_kana.csv> [--dict <IPADIC dir>] [--save <out.json>]
 *
 * The CSV (CC BY-SA 4.0) is not in this repository: get jvs_nonpara_kana.csv from
 * https://github.com/CyberAgentAILab/jvs_nonpara_kana (measured at commit 3c7f1cd). Each sentence goes
 * through the Rust tokenizer (the addon from `cargo build --release --manifest-path
 * native/rust/Cargo.toml -p miteiru-node`), its words' pronunciations joined.
 *
 * Two error rates, both character error rates over the benchmark's kana:
 * - paper: the benchmark's own normalization (ー becomes the vowel before it, 、 is dropped);
 * - reading: also を as オ and a long e or o written with イ or ウ as the vowel itself (エイ → エエ,
 *   オウ → オオ) on both sides, so that it measures readings and not how an analyzer spells them out
 *   (IPADIC's pronunciations keep センセイ but give ケーサツ).
 * Each over all lines and over the lines without digits or Latin letters, which Miteiru does not read
 * (no furigana over 3 or abc), where the readings themselves are compared.
 */
import fs from "node:fs";
import path from "node:path";
import {defaultAddonPath, loadAddon} from "../../main/headless/nativeAddon";

export interface JvsLine {
  base: string;
  text: string;
  kana: string;
}

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

export const readJvs = (file: string): JvsLine[] => parseCsv(fs.readFileSync(file, "utf8")).slice(1)
  .map(([base, text, kana]) => ({base, text, kana}));

const ROWS: Record<string, string> = {
  ア: "アカガサザタダナハバパマヤャラワァ",
  イ: "イキギシジチヂニヒビピミリィ",
  ウ: "ウクグスズツヅヌフブプムユュルゥヴ",
  エ: "エケゲセゼテデネヘベペメレェ",
  オ: "オコゴソゾトドノホボポモヨョロヲォ"
};
const VOWEL = new Map(Object.entries(ROWS).flatMap(([vowel, kana]) => Array.from(kana).map((character) => [character, vowel] as const)));

/** The benchmark's normalization: ー becomes the vowel before it (after ン or ッ it stays), 、 is dropped. */
export const paperForm = (text: string) => {
  let previous: string | undefined;
  let out = "";
  for (const character of text) {
    if (character === "ー") {
      out += previous ?? character;
      continue;
    }
    out += character;
    previous = VOWEL.get(character);
  }
  return out.replace(/、/g, "");
};

/** paperForm, with を as オ and エイ, オウ as エエ, オオ. */
export const readingForm = (text: string) => {
  const characters = Array.from(paperForm(text.replace(/ヲ/g, "オ")));
  for (let index = 1; index < characters.length; index++) {
    if (characters[index] === "イ" && VOWEL.get(characters[index - 1]) === "エ") characters[index] = "エ";
    if (characters[index] === "ウ" && VOWEL.get(characters[index - 1]) === "オ") characters[index] = "オ";
  }
  return characters.join("");
};

const distance = (a: string, b: string) => {
  const x = Array.from(a);
  const y = Array.from(b);
  let previous = Array.from({length: y.length + 1}, (_, index) => index);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[y.length];
};

/** Character error rate of predictions (katakana per line) against the benchmark, in a form. */
export const errorRate = (lines: JvsLine[], predictions: Record<string, string>, form: (text: string) => string) => {
  let characters = 0;
  let errors = 0;
  for (const line of lines) {
    const reference = form(line.kana);
    characters += Array.from(reference).length;
    errors += distance(reference, form(predictions[line.base] ?? ""));
  }
  return errors / characters;
};

const katakana = (text: string) => Array.from(text).map((character) => (character >= "ぁ" && character <= "ゖ" ? String.fromCharCode(character.charCodeAt(0) + 0x60) : character)).join("");
const kanaOnly = (text: string) => Array.from(text).filter((character) => (character >= "ァ" && character <= "ヺ") || character === "ー" || character === "、").join("");

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const csv = args.find((arg, index) => !arg.startsWith("--") && !["--dict", "--save"].includes(args[index - 1]));
  if (!csv) throw new Error("Usage: npx tsx scripts/eval/jvsKana.ts <jvs_nonpara_kana.csv> [--dict <IPADIC dir>] [--save <out.json>]");
  const root = path.resolve(__dirname, "..", "..");
  const dict = option("--dict") ?? path.join(root, "node_modules", "kuromoji", "dict");
  const run = async () => {
    const addon = loadAddon(defaultAddonPath(root));
    await addon.japaneseLoad(dict, null, false);
    const lines = readJvs(csv);
    const predictions: Record<string, string> = {};
    for (let at = 0; at < lines.length; at += 128) {
      const batch = lines.slice(at, at + 128);
      const tokens = JSON.parse(await addon.japaneseTokenizeBatch(dict, batch.map((line) => line.text))) as Array<Array<{surface_form: string; pronunciation?: string}>>;
      batch.forEach((line, index) => {
        predictions[line.base] = kanaOnly(tokens[index].map((token) => token.pronunciation
          ?? (/^[ぁ-ヿ]+$/u.test(token.surface_form) ? katakana(token.surface_form) : "")).join(""));
      });
    }
    if (option("--save")) fs.writeFileSync(option("--save")!, JSON.stringify(predictions));
    const plain = lines.filter((line) => !/[0-9０-９A-Za-zＡ-Ｚａ-ｚ]/u.test(line.text));
    const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
    console.log(`${lines.length} lines (${plain.length} without digits or Latin letters)`);
    console.log(`paper CER ${percent(errorRate(lines, predictions, paperForm))}, reading CER ${percent(errorRate(lines, predictions, readingForm))}, reading CER without digits/Latin ${percent(errorRate(plain, predictions, readingForm))}`);
  };
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
