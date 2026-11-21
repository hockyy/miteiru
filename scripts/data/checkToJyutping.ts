// From the repo root, before removal: npx tsx scripts/data/checkToJyutping.ts
// To rebuild later: npm install --prefix <temp> --ignore-scripts to-jyutping@3.1.1
// npx tsx scripts/data/checkToJyutping.ts <temp>/node_modules/to-jyutping
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {jyutpingBatch} from "../../main/language/jyutping";
import {chineseReadingCorpus} from "./chineseReadingCorpus";

const referenceDir = path.resolve(process.argv[2] ?? "node_modules/to-jyutping");
const {name, version} = JSON.parse(fs.readFileSync(path.join(referenceDir, "package.json"), "utf8"));
assert.equal(`${name}@${version}`, "to-jyutping@3.1.1");
const reference: {getJyutpingList(text: string): [string, string | null][]} = createRequire(__filename)(referenceDir);
async function check() {
  const corpus = chineseReadingCorpus();
  const actual = await jyutpingBatch(corpus);
  const cases = corpus.map((text, i) => {
    const expected = reference.getJyutpingList(text);
    assert.deepEqual(actual[i], expected, text);
    return {text, expected};
  });
  const fixture = cases.map(row => JSON.stringify(row)).join(",\n");
  assert.ok(Buffer.byteLength(fixture) + 5 < 1_000_000);
  fs.mkdirSync("tests/fixtures/in-house", {recursive: true});
  fs.writeFileSync("tests/fixtures/in-house/to-jyutping.json", `[\n${fixture}\n]\n`);
  console.log(`${cases.length} inputs, 0 differences`);
}
void check();
