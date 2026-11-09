import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {readAsset} from "../main/helpers/assetFiles";
import {cliOptions, DEFAULT_FIXTURES, loadFixtures, readJsonl, VARIANTS,
  type ScopedFixture, type Variant} from "./evalTokenizers";

export type DictionaryException = {id: string; token: string; kind: "name" | "oov"; reason: string};
export type Wordlists = Record<Variant, Set<string>>;
export const DEFAULT_ASSETS = path.resolve(__dirname, "../renderer/public/language-assets");
export const isLexicalSurface = (token: string) => Array.from(token).length > 1 && /[\p{L}\p{N}]/u.test(token);

export async function loadWordlists(assets = DEFAULT_ASSETS) {
  const wordlists = {} as Wordlists;
  const dictionaries: {file: string; sha256: string; version: unknown; headwords: number}[] = [];
  for (const [file, variants] of [
    ["japanese/dict/jmdict.json", ["ja"]],
    ["mandarin/chinese/chinese.json", ["zh-Hans", "zh-Hant"]],
    ["cantonese/cantonese/cantodict.json", ["yue"]]
  ] as [string, Variant[]][]) {
    const bytes = await readAsset(path.join(assets, file));
    const raw = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(raw.words)) throw new Error(file + ": missing words array");
    const forms = new Set<string>();
    for (const word of raw.words) {
      if (variants[0] === "ja") {
        for (const form of [...(word.kanji ?? []), ...(word.kana ?? [])]) {
          if (typeof form.text === "string" && form.text) forms.add(form.text);
        }
      } else {
        for (const form of [word.content, word.simplified]) if (typeof form === "string" && form) forms.add(form);
      }
    }
    dictionaries.push({file, sha256: createHash("sha256").update(bytes).digest("hex"),
      version: raw.version, headwords: forms.size});
    for (const variant of variants) wordlists[variant] = forms;
  }
  return {wordlists, dictionaries};
}

export function auditCoverage(fixtures: ScopedFixture[], wordlists: Wordlists, rows: unknown[]) {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const exceptions = new Map<string, DictionaryException>();
  const key = (id: string, token: string) => JSON.stringify([id, token]);
  for (const row of rows) {
    const exception = row as DictionaryException;
    if (!exception || typeof exception.id !== "string" || typeof exception.token !== "string"
      || !["name", "oov"].includes(exception.kind) || typeof exception.reason !== "string" || !exception.reason.trim()) {
      throw new Error("Invalid dictionary exception: " + JSON.stringify(row));
    }
    const fixture = byId.get(exception.id);
    if (!fixture || !fixture.gold.includes(exception.token) || !isLexicalSurface(exception.token)) {
      throw new Error("Exception does not refer to a multi-character gold unit: " + exception.id + " " + exception.token);
    }
    if (wordlists[fixture.variant].has(exception.token)) {
      throw new Error("Stale exception; surface is dictionary-supported: " + exception.id + " " + exception.token);
    }
    const identifier = key(exception.id, exception.token);
    if (exceptions.has(identifier)) throw new Error("Duplicate dictionary exception: " + identifier);
    exceptions.set(identifier, exception);
  }
  const uncovered: {id: string; token: string; text: string}[] = [];
  const groups = VARIANTS.map((variant) => {
    let occurrences = 0;
    let supported = 0;
    let names = 0;
    let oov = 0;
    const surfaces = new Set<string>();
    for (const fixture of fixtures.filter((line) => line.variant === variant)) {
      for (const token of fixture.gold.filter(isLexicalSurface)) {
        occurrences++;
        surfaces.add(token);
        if (wordlists[variant].has(token)) supported++;
        else {
          const exception = exceptions.get(key(fixture.id, token));
          if (!exception) uncovered.push({id: fixture.id, token, text: fixture.text});
          else if (exception.kind === "name") names++;
          else oov++;
        }
      }
    }
    return {variant, occurrences, uniqueSurfaces: surfaces.size, supported, names, oov};
  });
  return {schemaVersion: 1, groups, exceptionRecords: exceptions.size, uncovered};
}

if (require.main === module) {
  (async () => {
    const options = cliOptions(process.argv.slice(2), ["--assets", "--fixtures", "--exceptions", "--report"]);
    const directory = options.get("--fixtures") ?? DEFAULT_FIXTURES;
    const {wordlists, dictionaries} = await loadWordlists(options.get("--assets"));
    const report = {...auditCoverage(loadFixtures(directory), wordlists,
      readJsonl(options.get("--exceptions") ?? path.join(directory, "dictionary-exceptions.jsonl"))), dictionaries};
    if (options.has("--report")) fs.writeFileSync(options.get("--report")!, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    if (report.uncovered.length) process.exitCode = 1;
  })().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
