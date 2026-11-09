import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import ts from "typescript";
import * as OpenCC from "opencc-js";

type Line = {id: string; text: string; source?: string};
type Prediction = {id: string; tokens: string[]};
const root = path.resolve(__dirname, "..");
const han = /[\p{Script=Han}]/u;
const jsonl = <T>(file: string): T[] => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const writeJsonl = (file: string, lines: unknown[]) => fs.writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");

const fixtureLines = () => {
  const result: {text: string; source: string}[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (["tokenizer-eval", "chinese-tokenizer"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      const source = path.relative(root, file).split(path.sep).join("/");
      const text = fs.readFileSync(file, "utf8");
      if (/\.[cm]?[jt]sx?$/.test(file)) {
        const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const walk = (node: ts.Node) => {
          if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && [...node.text].filter((letter) => han.test(letter)).length >= 5) {
            result.push({text: node.text, source});
          }
          ts.forEachChild(node, walk);
        };
        walk(parsed);
      } else if (/\.(srt|ass|txt|json)$/.test(file)) {
        for (const line of text.split(/\r?\n/)) {
          if ([...line].filter((letter) => han.test(letter)).length >= 5) result.push({text: line, source});
        }
      }
    }
  };
  visit(path.join(root, "tests"));
  return result;
};

export function prepareChineseCorpus(output: string) {
  fs.mkdirSync(output, {recursive: true});
  const traditional = OpenCC.Converter({from: "cn", to: "t"});
  const fixtures = fixtureLines();
  for (const language of ["zh-Hans", "zh-Hant", "yue"]) {
    const seeds = fs.readFileSync(path.join(root, "tests/fixtures/chinese-tokenizer", language === "yue" ? "cantonese.txt" : "mandarin.txt"), "utf8").trim().split(/\r?\n/);
    if (seeds.length < 500 || new Set(seeds).size !== seeds.length) throw new Error("At least 500 distinct authored sentences are required");
    const lines: Line[] = seeds.map((text, index) => ({
      id: `${language}-authored-${index + 1}-1`, text: language === "zh-Hant" ? traditional(text) : text,
      source: "authored subtitle-style sentence"
    }));
    const unique = new Set(lines.map((line) => line.text));
    for (const fixture of fixtures) {
      if (unique.has(fixture.text)) continue;
      unique.add(fixture.text);
      lines.push({id: `${language}-repo-${lines.length}`, ...fixture});
    }
    writeJsonl(path.join(output, `${language}.corpus.jsonl`), lines);
  }
}

const coverage = (predictions: Prediction[], words: Set<string>) => {
  let multi = 0, found = 0, characters = 0, covered = 0;
  for (const {tokens} of predictions) {
    for (const token of tokens) {
      const letters = [...token];
      const count = letters.filter((letter) => han.test(letter)).length;
      characters += count;
      if (letters.length < 2 || !count) continue;
      multi++;
      if (words.has(token)) { found++; covered += count; }
    }
  }
  return {multiCharacterTokens: multi, dictionaryTokens: found, multiCharacterDictionaryShare: found / (multi || 1),
    hanCharacters: characters, dictionaryCoveredCharacters: covered, characterCoverage: covered / (characters || 1)};
};

export function compareChineseTokenizers(assets: string, output: string, extraCorpus?: string) {
  prepareChineseCorpus(output);
  if (process.platform === "win32" && !process.env.CARGO_TARGET_DIR) throw new Error("Set CARGO_TARGET_DIR to the shared Cargo build directory first");
  const env = {...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join(root, "native/rust/target")};
  const build = spawnSync("cargo", ["build", "--release", "--manifest-path", path.join(root, "native/rust/Cargo.toml"), "-p", "miteiru-tokenizer", "--example", "chinese_eval"], {cwd: root, env, stdio: "inherit"});
  if (build.status) throw new Error("Chinese evaluation build failed");
  const binary = path.join(env.CARGO_TARGET_DIR, "release/examples/chinese_eval" + (process.platform === "win32" ? ".exe" : ""));
  const summary: unknown[] = [];
  for (const language of ["zh-Hans", "zh-Hant", "yue"]) {
    const relative = language === "yue" ? "cantonese/cantonese" : "mandarin/chinese";
    const directory = path.join(assets, relative);
    const raw = JSON.parse(fs.readFileSync(path.join(directory, language === "yue" ? "cantodict.json" : "chinese.json"), "utf8"));
    const words = new Set<string>(raw.words.flatMap((word: {content: string; simplified?: string}) => [word.content, word.simplified].filter(Boolean)));
    const wordsPath = path.join(output, `${language}.headwords.txt`);
    fs.writeFileSync(wordsPath, [...words].sort().join("\n"));
    const corpusPath = extraCorpus ? path.join(extraCorpus, `${language}.dev.jsonl`) : path.join(output, `${language}.corpus.jsonl`);
    const corpus = jsonl<Line>(corpusPath);
    const predictions = new Map<string, Prediction[]>();
    for (const [label, engine, overlay, hmm] of [["jieba", "jieba", false, true], ["jieba-no-hmm", "jieba", false, false], ["base", "native", false, true], ["app", "native", true, true]] as const) {
      const outputPath = path.join(output, `${language}.${label}.jsonl`);
      const run = spawnSync(binary, [engine, language === "yue" ? "yue" : "zh", path.join(directory, language === "yue" ? "yue.jieba.txt" : "zh.jieba.txt"), overlay ? wordsPath : "-", corpusPath, outputPath, String(hmm)], {cwd: root, env, encoding: "utf8"});
      if (run.status) throw new Error(run.stderr || `${label} failed`);
      const result = jsonl<Prediction>(outputPath);
      predictions.set(label, result);
      const metrics = {...JSON.parse(run.stdout), label, language, coverage: coverage(result, words)};
      console.log(JSON.stringify(metrics));
      summary.push(metrics);
    }
    for (const [label, before, report] of [["base", "jieba", "base"], ["app", "base", "app"], ["app", "jieba", "full"]]) {
      const previous = predictions.get(before)!;
      const current = predictions.get(label)!;
      const changed = corpus.flatMap((line, index) => JSON.stringify(previous[index].tokens) === JSON.stringify(current[index].tokens) ? []
        : [{...line, before: previous[index].tokens, after: current[index].tokens}]);
      writeJsonl(path.join(output, `${language}.${report}.changed.jsonl`), changed);
      summary.push({language, comparison: `${before}->${label}`, changedLines: changed.length, lines: corpus.length, changedShare: changed.length / corpus.length});
    }
  }
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  const [assets, output, devGold] = process.argv.slice(2);
  if (!assets || !output) throw new Error("usage: tsx scripts/compareChineseTokenizer.ts <language-assets> <output directory> [gold dev directory]");
  compareChineseTokenizers(path.resolve(assets), path.resolve(output), devGold && path.resolve(devGold));
}
