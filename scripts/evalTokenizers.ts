import fs from "node:fs";
import path from "node:path";

export const VARIANTS = ["ja", "zh-Hans", "zh-Hant", "yue"] as const;
export const SPLITS = ["dev", "test"] as const;
export type Variant = typeof VARIANTS[number];
export type Split = typeof SPLITS[number];
export type Fixture = {id: string; text: string; gold: string[]; categories: string[]; notes?: string};
export type ScopedFixture = Fixture & {variant: Variant; split: Split};
export type Prediction = {id: string; tokens: string[]};
export type Counts = {correct: number; predicted: number; expected: number; exact: number; lines: number};
export const DEFAULT_FIXTURES = path.resolve(__dirname, "../tests/fixtures/tokenizer-eval");

export function readJsonl(file: string): unknown[] {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(file + ":" + (index + 1) + ": invalid JSONL");
    }
  });
}

export function validateTokens(tokens: unknown, text: string, label: string): asserts tokens is string[] {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some((token) =>
    typeof token !== "string" || !token.length || !token.isWellFormed())) {
    throw new Error(label + ": expected nonempty, well-formed string tokens");
  }
  if (tokens.join("") !== text) throw new Error(label + ": tokens do not reconstruct text");
}

export function loadFixtures(directory = DEFAULT_FIXTURES, variants: readonly Variant[] = VARIANTS,
  splits: readonly Split[] = SPLITS): ScopedFixture[] {
  const seenIds = new Set<string>();
  const seenTexts = new Map<Variant, Set<string>>();
  return variants.flatMap((variant) => splits.flatMap((split) => {
    const file = path.join(directory, variant + "." + split + ".jsonl");
    const rows = readJsonl(file);
    if (!rows.length) throw new Error(file + ": empty split");
    return rows.map((row: Fixture) => {
      if (!row || typeof row.id !== "string" || !row.id.startsWith(variant + "-")
        || typeof row.text !== "string" || !row.text.length || !row.text.isWellFormed()
        || !Array.isArray(row.categories) || !row.categories.length
        || row.categories.some((category) => typeof category !== "string" || !category.length)
        || new Set(row.categories).size !== row.categories.length
        || (row.notes !== undefined && typeof row.notes !== "string")) {
        throw new Error(file + ": invalid fixture " + JSON.stringify(row));
      }
      if (seenIds.has(row.id)) throw new Error("Duplicate fixture id: " + row.id);
      seenIds.add(row.id);
      const texts = seenTexts.get(variant) ?? new Set<string>();
      if (texts.has(row.text)) throw new Error("Duplicate " + variant + " text: " + row.id);
      texts.add(row.text);
      seenTexts.set(variant, texts);
      validateTokens(row.gold, row.text, row.id + " gold");
      return {...row, variant, split};
    });
  }));
}

export function boundaries(tokens: string[]): Set<number> {
  let offset = 0;
  return new Set(tokens.slice(0, -1).map((token) => {
    offset += Array.from(token).length;
    return offset;
  }));
}

export function lineCounts(gold: string[], tokens: string[]): Counts {
  const expected = boundaries(gold);
  const predicted = boundaries(tokens);
  return {
    correct: [...predicted].filter((offset) => expected.has(offset)).length,
    predicted: predicted.size,
    expected: expected.size,
    exact: gold.length === tokens.length && gold.every((token, index) => token === tokens[index]) ? 1 : 0,
    lines: 1
  };
}

export function metrics(counts: Counts) {
  const precision = counts.predicted ? counts.correct / counts.predicted : Number(!counts.expected);
  const recall = counts.expected ? counts.correct / counts.expected : Number(!counts.predicted);
  const f1 = counts.expected + counts.predicted ? 2 * counts.correct / (counts.expected + counts.predicted) : 1;
  return {...counts, precision, recall, f1, exactMatch: counts.lines ? counts.exact / counts.lines : 0};
}

function addCounts(target: Counts, source: Counts) {
  for (const key of ["correct", "predicted", "expected", "exact", "lines"] as const) target[key] += source[key];
}

const emptyCounts = (): Counts => ({correct: 0, predicted: 0, expected: 0, exact: 0, lines: 0});

export function evaluate(fixtures: ScopedFixture[], rows: unknown[], worstCount = 10) {
  if (!fixtures.length) throw new Error("No fixtures selected");
  if (!Number.isInteger(worstCount) || worstCount < 0) throw new Error("worst must be a nonnegative integer");
  const selected = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  if (selected.size !== fixtures.length) throw new Error("Duplicate fixture ids");
  const predictions = new Map<string, string[]>();
  for (const row of rows) {
    const prediction = row as Prediction;
    if (!prediction || typeof prediction.id !== "string") throw new Error("Prediction missing string id");
    const fixture = selected.get(prediction.id);
    if (!fixture) throw new Error("Unknown or out-of-scope prediction id: " + prediction.id);
    if (predictions.has(prediction.id)) throw new Error("Duplicate prediction id: " + prediction.id);
    validateTokens(prediction.tokens, fixture.text, prediction.id);
    predictions.set(prediction.id, prediction.tokens);
  }
  const missing = fixtures.filter((fixture) => !predictions.has(fixture.id));
  if (missing.length) throw new Error("Missing " + missing.length + " predictions: "
    + missing.slice(0, 8).map((row) => row.id).join(", "));
  const groups = new Map<string, {variant: Variant; split: Split; counts: Counts;
    categories: Map<string, Counts>; lines: ReturnType<typeof scoredLine>[]}>();
  for (const fixture of fixtures) {
    const key = fixture.variant + "/" + fixture.split;
    const group = groups.get(key) ?? {variant: fixture.variant, split: fixture.split,
      counts: emptyCounts(), categories: new Map<string, Counts>(), lines: []};
    const tokens = predictions.get(fixture.id)!;
    const counts = lineCounts(fixture.gold, tokens);
    addCounts(group.counts, counts);
    for (const category of fixture.categories) {
      const total = group.categories.get(category) ?? emptyCounts();
      addCounts(total, counts);
      group.categories.set(category, total);
    }
    group.lines.push(scoredLine(fixture, tokens, counts));
    groups.set(key, group);
  }
  return {schemaVersion: 1, boundaryUnit: "unicode-code-point", groups: [...groups.values()].map((group) => ({
    variant: group.variant,
    split: group.split,
    ...metrics(group.counts),
    categories: Object.fromEntries([...group.categories].sort(([left], [right]) => left.localeCompare(right))
      .map(([category, counts]) => [category, metrics(counts)])),
    worst: group.lines.filter((line) => !line.exact).sort((left, right) => left.f1 - right.f1
      || (right.expected + right.predicted - 2 * right.correct) - (left.expected + left.predicted - 2 * left.correct)
      || left.id.localeCompare(right.id)).slice(0, worstCount)
  }))};
}

function scoredLine(fixture: ScopedFixture, tokens: string[], counts: Counts) {
  const expected = boundaries(fixture.gold);
  const predicted = boundaries(tokens);
  return {id: fixture.id, text: fixture.text, categories: fixture.categories,
    gold: fixture.gold, tokens, ...metrics(counts),
    extraBoundaries: [...predicted].filter((offset) => !expected.has(offset)),
    missingBoundaries: [...expected].filter((offset) => !predicted.has(offset))};
}

export function scoreMarkdown(report: ReturnType<typeof evaluate>, includeDetails = true): string {
  const percent = (value: number) => (100 * value).toFixed(2) + "%";
  const table = (rows: {label: string; lines: number; precision: number; recall: number; f1: number; exactMatch: number}[]) => [
    "| Scope | Lines | Boundary P | Boundary R | Boundary F1 | Exact lines |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => "| " + [row.label, row.lines, percent(row.precision), percent(row.recall),
      percent(row.f1), percent(row.exactMatch)].join(" | ") + " |")
  ].join("\n");
  const sections = [table(report.groups.map((group) => ({label: group.variant + " " + group.split, ...group})))];
  if (includeDetails) for (const group of report.groups) {
    sections.push("## " + group.variant + " " + group.split + "\n\n" + table(Object.entries(group.categories)
      .map(([category, values]) => ({label: category, ...values})))
      + "\n\nWorst non-exact lines (Unicode-code-point boundaries):\n\n"
      + group.worst.map((line) => "- **" + line.id + "** (F1 " + percent(line.f1) + "): " + JSON.stringify(line.text)
        + "\n  Gold: " + JSON.stringify(line.gold) + "\n  Predicted: " + JSON.stringify(line.tokens)).join("\n"));
  }
  return sections.join("\n\n") + "\n";
}

export function cliOptions(args: string[], allowed: readonly string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.includes(flag) || !value || value.startsWith("--") || options.has(flag)) {
      throw new Error("Expected unique option/value pairs; allowed: " + allowed.join(", "));
    }
    options.set(flag, value);
  }
  return options;
}

export function selectedScope(options: Map<string, string>) {
  const variant = options.get("--variant") ?? "all";
  const split = options.get("--split") ?? "dev";
  if (variant !== "all" && !VARIANTS.includes(variant as Variant)) throw new Error("Invalid variant: " + variant);
  if (split !== "all" && !SPLITS.includes(split as Split)) throw new Error("Invalid split: " + split);
  return {variants: variant === "all" ? VARIANTS : [variant as Variant],
    splits: split === "all" ? SPLITS : [split as Split]};
}

if (require.main === module) {
  try {
    const options = cliOptions(process.argv.slice(2), ["--predictions", "--fixtures", "--variant", "--split", "--worst", "--json", "--markdown"]);
    if (!options.has("--predictions")) throw new Error("Usage: npx tsx scripts/evalTokenizers.ts --predictions FILE [--split dev|test|all] [--variant ja|zh-Hans|zh-Hant|yue|all] [--json FILE] [--markdown FILE]");
    const scope = selectedScope(options);
    const report = evaluate(loadFixtures(options.get("--fixtures"), scope.variants, scope.splits),
      readJsonl(options.get("--predictions")!), Number(options.get("--worst") ?? 10));
    const markdown = scoreMarkdown(report);
    if (options.has("--json")) fs.writeFileSync(options.get("--json")!, JSON.stringify(report, null, 2) + "\n");
    if (options.has("--markdown")) fs.writeFileSync(options.get("--markdown")!, markdown);
    process.stdout.write(markdown);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
