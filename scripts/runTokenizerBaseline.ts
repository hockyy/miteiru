import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {Jieba} from "@node-rs/jieba";
import Japanese from "../main/handler/japanese";
import Chinese from "../main/handler/chinese";
import {parseJapaneseVerbs} from "../main/handler/languages/analyzer";
import {readAsset} from "../main/helpers/assetFiles";
import {cliOptions, evaluate, loadFixtures, scoreMarkdown, selectedScope, validateTokens} from "./evalTokenizers";
import {DEFAULT_ASSETS} from "./checkTokenizerEvalDictionary";

async function run() {
  const options = cliOptions(process.argv.slice(2), ["--assets", "--fixtures", "--variant", "--split", "--out"]);
  const scope = selectedScope(options);
  const fixtures = loadFixtures(options.get("--fixtures"), scope.variants, scope.splits);
  const assets = options.get("--assets") ?? DEFAULT_ASSETS;
  const output = options.get("--out");
  if (!output) throw new Error("Usage: npx tsx scripts/runTokenizerBaseline.ts --assets LOCAL_PACKS --out DIRECTORY [--split dev|test|all]");
  fs.mkdirSync(output, {recursive: true});
  const predictions: {id: string; tokens: string[]}[] = [];
  const inputs: {file: string; sha256: string}[] = [];
  for (const variant of scope.variants) {
    let tokenize: (text: string) => Promise<string[]>;
    if (variant === "ja") {
      Japanese.kuromojiDictPath = path.join(assets, "japanese/dict");
      const tokenizer = await Japanese.loadKuromojiTokenizer();
      for (const filename of fs.readdirSync(Japanese.kuromojiDictPath).filter((name) => name.endsWith(".dat.gz")).sort()) {
        const file = path.join("japanese/dict", filename).replace(/\\/gu, "/");
        inputs.push({file, sha256: createHash("sha256").update(fs.readFileSync(path.join(assets, file))).digest("hex")});
      }
      tokenize = async (text) => (await parseJapaneseVerbs(Japanese.processKuromojinToSeparations(
        tokenizer.tokenizeForSentence(text)))).map((token) => token.origin);
    } else {
      const file = variant === "yue" ? "cantonese/cantonese/yue.jieba.txt" : "mandarin/chinese/zh.jieba.txt";
      const bytes = await readAsset(path.join(assets, file));
      if (!inputs.some((input) => input.file === file)) {
        inputs.push({file, sha256: createHash("sha256").update(bytes).digest("hex")});
      }
      Chinese.jieba = Jieba.withDict(bytes);
      tokenize = async (text) => (await (variant === "yue"
        ? Chinese.getJyutpingForSentence(text, "symbol") : Chinese.tokenizeUsingJieba(text, "num")))
        .map((token) => token.origin);
    }
    for (const fixture of fixtures.filter((line) => line.variant === variant)) {
      const tokens = await tokenize(fixture.text);
      validateTokens(tokens, fixture.text, fixture.id + " baseline");
      predictions.push({id: fixture.id, tokens});
    }
  }
  const report = evaluate(fixtures, predictions);
  fs.writeFileSync(path.join(output, "predictions.jsonl"), predictions.map((row) => JSON.stringify(row)).join("\n") + "\n");
  fs.writeFileSync(path.join(output, "scores.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(output, "scores.md"), scoreMarkdown(report));
  const packageVersion = (name: string) => JSON.parse(fs.readFileSync(require.resolve(name + "/package.json"), "utf8")).version;
  const hashFile = (file: string) => ({file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex")});
  const fixtureRoot = options.get("--fixtures") ?? path.resolve(__dirname, "../tests/fixtures/tokenizer-eval");
  const fixtureInputs = scope.variants.flatMap((variant) => scope.splits.map((split) => {
    const file = variant + "." + split + ".jsonl";
    return {file, sha256: createHash("sha256").update(fs.readFileSync(path.join(fixtureRoot, file))).digest("hex")};
  }));
  const manifest = {schemaVersion: 1, evaluatedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim(),
    node: process.version, platform: process.platform, packages: {kuromoji: packageVersion("kuromoji"),
      "@node-rs/jieba": packageVersion("@node-rs/jieba")}, variants: scope.variants, splits: scope.splits,
    customDictionary: "disabled; no application profile loaded", hmm: "jieba cut default (enabled)", inputs,
    fixtures: fixtureInputs, tools: ["scripts/runTokenizerBaseline.ts", "scripts/evalTokenizers.ts"].map(hashFile),
    pipeline: ["main/handler/japanese.ts", "main/handler/chinese.ts",
      "main/handler/languages/analyzer.ts", "main/handler/languages/japaneseAnalysis.ts",
      "main/handler/languages/verbConjugation.ts"].map(hashFile)};
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(scoreMarkdown(report, false));
}

if (require.main === module) run().catch((error) => {
  console.error((error as Error).stack ?? String(error));
  process.exitCode = 1;
});
