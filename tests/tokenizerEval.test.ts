import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {test} from "node:test";
import {boundaries, cliOptions, DEFAULT_FIXTURES, evaluate, lineCounts, loadFixtures, metrics,
  readJsonl, scoreMarkdown, selectedScope, SPLITS, validateTokens, VARIANTS,
  type ScopedFixture} from "../scripts/evalTokenizers";
import {auditCoverage, isLexicalSurface, type DictionaryException, type Wordlists} from "../scripts/checkTokenizerEvalDictionary";
import {agreement} from "../scripts/tokenizerAgreement";

const example = (overrides: Partial<ScopedFixture> = {}): ScopedFixture => ({id: "ja-example", text: "猫が来た。",
  gold: ["猫", "が", "来た", "。"], categories: ["casual-speech", "particles"], variant: "ja", split: "dev", ...overrides});

test("tokenizer evaluation fixtures reconstruct, have unique ids/texts and all balanced splits", () => {
  const fixtures = loadFixtures();
  assert.equal(fixtures.length, 1200);
  assert.equal(new Set(fixtures.map((row) => row.id)).size, 1200);
  for (const variant of VARIANTS) for (const split of SPLITS) {
    const rows = fixtures.filter((row) => row.variant === variant && row.split === split);
    assert.equal(rows.length, 150, variant + "/" + split);
    for (const row of rows) assert.equal(row.gold.join(""), row.text, row.id);
    const counterpart = fixtures.filter((row) => row.variant === variant && row.split !== split);
    const categories = new Set(rows.flatMap((row) => row.categories));
    assert.deepEqual(categories, new Set(counterpart.flatMap((row) => row.categories)));
    for (const category of categories) {
      const count = rows.filter((row) => row.categories.includes(category)).length;
      const other = counterpart.filter((row) => row.categories.includes(category)).length;
      assert.ok(Math.abs(count - other) <= 2, variant + "/" + category + " split imbalance");
    }
  }
});

test("tokenizer annotations cover every line twice and every disagreement has a reason", () => {
  const report = agreement();
  const fixtures = loadFixtures();
  const decisions = readJsonl(path.join(DEFAULT_FIXTURES, "adjudications.jsonl")) as
    {id: string; gold: string[]; reason: string; stage: string}[];
  const byId = new Map(fixtures.map((row) => [row.id, row]));
  const differing = new Set<string>();
  const originalFirst = new Map<string, string[]>();
  for (const [first, second] of [["a", "b"], ["c", "d"]]) {
    const originals = new Map((readJsonl(path.join(DEFAULT_FIXTURES, "annotations", first + ".jsonl")) as
      {id: string; tokens: string[]}[]).map((row) => [row.id, row.tokens]));
    for (const [id, tokens] of originals) originalFirst.set(id, tokens);
    for (const row of readJsonl(path.join(DEFAULT_FIXTURES, "annotations", second + ".jsonl")) as {id: string; tokens: string[]}[]) {
      if (JSON.stringify(originals.get(row.id)) !== JSON.stringify(row.tokens)) differing.add(row.id);
    }
  }
  const seen = new Set<string>();
  for (const decision of decisions) {
    assert.ok(byId.has(decision.id));
    assert.ok(typeof decision.reason === "string" && decision.reason.trim().length > 10);
    assert.ok(["annotation", "dictionary"].includes(decision.stage));
    const key = decision.id + "/" + decision.stage;
    assert.ok(!seen.has(key), key);
    seen.add(key);
    validateTokens(decision.gold, byId.get(decision.id)!.text, decision.id);
  }
  assert.deepEqual(new Set(decisions.filter((row) => row.stage === "annotation").map((row) => row.id)), differing);
  assert.equal(report.variants.reduce((total, row) => total + row.disagreements, 0), differing.size);
  for (const fixture of fixtures) {
    const history = decisions.filter((decision) => decision.id === fixture.id);
    assert.deepEqual(history.length ? history.at(-1)!.gold : originalFirst.get(fixture.id), fixture.gold, fixture.id);
  }
});

test("frozen provenance and baseline input hashes match the committed sources and gold", () => {
  const provenance = JSON.parse(fs.readFileSync(path.join(DEFAULT_FIXTURES, "provenance.json"), "utf8")) as
    {files: {file: string; sha256: string}[]};
  const baseline = JSON.parse(fs.readFileSync(path.join(DEFAULT_FIXTURES, "baseline", "manifest.json"), "utf8")) as
    {fixtures: {file: string; sha256: string}[]};
  for (const record of [...provenance.files, ...baseline.fixtures]) {
    const bytes = fs.readFileSync(path.join(DEFAULT_FIXTURES, record.file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256, record.file);
  }
  const fixtures = loadFixtures();
  for (const variant of VARIANTS) {
    const sources = readJsonl(path.join(DEFAULT_FIXTURES, "source", variant + ".jsonl")) as
      {id: string; text: string; categories: string[]}[];
    assert.equal(sources.length, 300);
    for (const source of sources) {
      const gold = fixtures.find((row) => row.id === source.id)!;
      assert.equal(source.text, gold.text);
      assert.deepEqual(source.categories, gold.categories);
    }
  }
});

test("boundary precision/recall are micro counts, not mean line F1", () => {
  assert.deepEqual([...boundaries(["a😀", "b", "c"])], [2, 3]);
  const counts = lineCounts(["ab", "c", "d"], ["a", "b", "cd"]);
  assert.deepEqual(counts, {correct: 1, predicted: 2, expected: 2, exact: 0, lines: 1});
  assert.equal(metrics(counts).f1, 0.5);
  const rows = [example(), example({id: "ja-short", text: "あ", gold: ["あ"], categories: ["particles"]})];
  const group = evaluate(rows, [{id: "ja-short", tokens: ["あ"]}, {id: "ja-example", tokens: ["猫が", "来た", "。"]}]).groups[0];
  assert.equal(group.correct, 2);
  assert.equal(group.predicted, 2);
  assert.equal(group.expected, 3);
  assert.equal(group.precision, 1);
  assert.equal(group.recall, 2 / 3);
  assert.equal(group.f1, 4 / 5);
  assert.equal(group.exactMatch, 0.5);
  assert.equal(group.categories["particles"].lines, 2);
  assert.equal(group.categories["casual-speech"].lines, 1);
  assert.equal(group.worst[0].id, "ja-example");
  assert.match(scoreMarkdown({schemaVersion: 1, boundaryUnit: "unicode-code-point", groups: [group]}), /80\.00%/);
});

test("single-token lines handle zero boundary denominators explicitly", () => {
  assert.equal(metrics(lineCounts(["猫"], ["猫"])).f1, 1);
  assert.equal(metrics(lineCounts(["猫猫"], ["猫", "猫"])).f1, 0);
  assert.equal(metrics(lineCounts(["猫", "猫"], ["猫猫"])).f1, 0);
});

test("scorer rejects incomplete, duplicate, foreign, empty and corrupted predictions", () => {
  const fixture = example();
  const valid = {id: fixture.id, tokens: fixture.gold};
  assert.throws(() => evaluate([fixture], []), /Missing/);
  assert.throws(() => evaluate([fixture], [valid, valid]), /Duplicate/);
  assert.throws(() => evaluate([fixture], [{...valid, id: "ja-test-only"}]), /out-of-scope/);
  assert.throws(() => evaluate([fixture], [{id: fixture.id, tokens: []}]), /nonempty/);
  assert.throws(() => evaluate([fixture], [{id: fixture.id, tokens: ["猫", ""]}]), /nonempty/);
  assert.throws(() => evaluate([fixture], [{id: fixture.id, tokens: ["犬が来た。"]}]), /reconstruct/);
  assert.throws(() => evaluate([fixture], [null]), /string id/);
  assert.throws(() => validateTokens(["\ud83d", "\ude00"], "😀", "emoji"), /well-formed/);
  assert.throws(() => evaluate([fixture], [valid], -1), /nonnegative/);
  assert.throws(() => evaluate([fixture], [valid], 0.5), /nonnegative/);
  assert.equal(evaluate([fixture], [valid], 0).groups[0].worst.length, 0);
});

test("fixture loading reports malformed JSONL, invalid rows, empty splits and duplicate ids", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-tokenizer-eval-"));
  const file = path.join(directory, "ja.dev.jsonl");
  try {
    fs.writeFileSync(file, "{bad}\n");
    assert.throws(() => readJsonl(file), /:1: invalid JSONL/);
    fs.writeFileSync(file, "");
    assert.throws(() => loadFixtures(directory, ["ja"], ["dev"]), /empty split/);
    fs.writeFileSync(file, JSON.stringify({...example(), categories: []}) + "\n");
    assert.throws(() => loadFixtures(directory, ["ja"], ["dev"]), /invalid fixture/);
    fs.writeFileSync(file, [example(), example()].map((row) => JSON.stringify(row)).join("\n"));
    assert.throws(() => loadFixtures(directory, ["ja"], ["dev"]), /Duplicate fixture id/);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test("dictionary audit demands explicit per-line exceptions and rejects stale/duplicate flags", () => {
  const fixture = example({text: "林小雨が来た。", gold: ["林小雨", "が", "来た", "。"]});
  const wordlists = Object.fromEntries(VARIANTS.map((variant) => [variant, new Set(["来た"])])) as Wordlists;
  const exception: DictionaryException = {id: fixture.id, token: "林小雨", kind: "name", reason: "Invented personal name."};
  assert.equal(auditCoverage([fixture], wordlists, []).uncovered.length, 1);
  assert.equal(auditCoverage([fixture], wordlists, [exception]).uncovered.length, 0);
  assert.throws(() => auditCoverage([fixture], wordlists, [exception, exception]), /Duplicate/);
  assert.throws(() => auditCoverage([fixture], wordlists, [{...exception, token: "来た"}]), /Stale/);
  assert.throws(() => auditCoverage([fixture], wordlists, [{...exception, token: "いない"}]), /does not refer/);
  assert.throws(() => auditCoverage([fixture], wordlists, [{...exception, reason: ""}]), /Invalid/);
  assert.equal(isLexicalSurface("……"), false);
  assert.equal(isLexicalSurface("  "), false);
  assert.equal(isLexicalSurface("USB-C"), true);
  assert.equal(isLexicalSurface("30"), true);
});

test("CLI defaults to dev and rejects misspelled scopes/options", () => {
  assert.deepEqual(selectedScope(new Map()).splits, ["dev"]);
  assert.deepEqual(selectedScope(new Map([["--variant", "yue"], ["--split", "test"]])), {variants: ["yue"], splits: ["test"]});
  assert.throws(() => selectedScope(new Map([["--split", "tesst"]])), /Invalid split/);
  assert.throws(() => cliOptions(["--split", "dev", "--split", "test"], ["--split"]), /unique/);
  assert.throws(() => cliOptions(["--typo", "dev"], ["--split"]), /allowed/);
});
