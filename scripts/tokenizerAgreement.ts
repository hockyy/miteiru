import fs from "node:fs";
import path from "node:path";
import {cliOptions, DEFAULT_FIXTURES, evaluate, lineCounts, loadFixtures, metrics,
  readJsonl, scoreMarkdown, validateTokens, VARIANTS, type Counts, type Prediction} from "./evalTokenizers";

export const ANNOTATORS = {ja: ["a", "b"], "zh-Hans": ["a", "b"], "zh-Hant": ["c", "d"], yue: ["c", "d"]} as const;

export function agreement(directory = DEFAULT_FIXTURES) {
  const fixtures = loadFixtures(directory);
  const byId = new Map(fixtures.map((line) => [line.id, line]));
  const annotations = new Map<string, Map<string, string[]>>();
  for (const name of ["a", "b", "c", "d"]) {
    const rows = readJsonl(path.join(directory, "annotations", name + ".jsonl")) as Prediction[];
    const selected = new Map<string, string[]>();
    for (const row of rows) {
      const fixture = byId.get(row?.id);
      if (!fixture || !(ANNOTATORS[fixture.variant] as readonly string[]).includes(name)) {
        throw new Error("Unexpected annotation id for " + name + ": " + row?.id);
      }
      if (selected.has(row.id)) throw new Error("Duplicate annotation id: " + row.id);
      validateTokens(row.tokens, fixture.text, name + "/" + row.id);
      selected.set(row.id, row.tokens);
    }
    const required = fixtures.filter((fixture) => (ANNOTATORS[fixture.variant] as readonly string[]).includes(name));
    if (selected.size !== required.length) throw new Error("Incomplete annotator " + name);
    annotations.set(name, selected);
  }
  const originalGold = fixtures.map((fixture) => ({...fixture,
    gold: annotations.get(ANNOTATORS[fixture.variant][0])!.get(fixture.id)!}));
  const second = fixtures.map((fixture) => ({id: fixture.id,
    tokens: annotations.get(ANNOTATORS[fixture.variant][1])!.get(fixture.id)!}));
  const report = evaluate(originalGold, second);
  const variants = VARIANTS.map((variant) => {
    const counts: Counts = {correct: 0, predicted: 0, expected: 0, exact: 0, lines: 0};
    let disagreements = 0;
    for (const fixture of originalGold.filter((line) => line.variant === variant)) {
      const values = lineCounts(fixture.gold, annotations.get(ANNOTATORS[variant][1])!.get(fixture.id)!);
      for (const key of Object.keys(counts) as (keyof Counts)[]) counts[key] += values[key];
      if (!values.exact) disagreements++;
    }
    return {variant, annotators: ANNOTATORS[variant], disagreements, ...metrics(counts)};
  });
  return {...report, variants};
}

export function agreementMarkdown(report: ReturnType<typeof agreement>) {
  return "# Independent LLM annotator agreement\n\nUntouched annotations, before adjudication. Model/model agreement is not human-validated accuracy.\n\n"
    + "| Variant | Lines | Boundary F1 | Exact agreement | Disagreements |\n| --- | ---: | ---: | ---: | ---: |\n"
    + report.variants.map((row) => "| " + [row.variant, row.lines, (row.f1 * 100).toFixed(2) + "%",
      (row.exactMatch * 100).toFixed(2) + "%", row.disagreements].join(" | ") + " |").join("\n")
    + "\n\n## By split\n\n" + scoreMarkdown(report, false);
}

if (require.main === module) {
  try {
    const options = cliOptions(process.argv.slice(2), ["--fixtures", "--json", "--markdown"]);
    const report = agreement(options.get("--fixtures"));
    const markdown = agreementMarkdown(report);
    if (options.has("--json")) fs.writeFileSync(options.get("--json")!, JSON.stringify(report, null, 2) + "\n");
    if (options.has("--markdown")) fs.writeFileSync(options.get("--markdown")!, markdown);
    process.stdout.write(markdown);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
