import type { InflectionRow, InflectionTable } from "../../main/handler/languages/inflectionTypes";
import type { UserNoteExample } from "../hooks/useUserNotes";

export type InflectionExampleDraft = UserNoteExample & {
  label: string;
};

const SENTENCE_TEMPLATES: Record<string, (form: string) => string> = {
  plain: (form) => `私はよく${form}。`,
  negative: (form) => `今日はまだ${form}。`,
  te: (form) => `${form}から、家に帰ります。`,
  past: (form) => `昨日、${form}。`,
  polite: (form) => `毎朝、${form}。`,
  volitional: (form) => `一緒に${form}。`,
  conditional: (form) => `時間があれば、${form}。`,
  imperative: (form) => `${form}。`,
  tai: (form) => `今日は${form}。`,
  potential: (form) => `ここでは${form}。`,
  progressive: (form) => `今、${form}。`,
  passive: (form) => `先生に${form}。`,
  causative: (form) => `子どもに${form}。`,
  tara: (form) => `${form}、すぐ分かります。`,
  "polite-negative": (form) => `今日は${form}。`,
  "negative-past": (form) => `その時は${form}。`,
  adverbial: (form) => `${form}走ります。`,
  attributive: (form) => `これは${form}部屋です。`,
  "stem-sou": (form) => `${form}ね。`,
};

export const buildInflectionExampleMeaning = (
  row: InflectionRow,
  wordMeaning: string,
): string => {
  const gloss = wordMeaning.trim();
  const formNote = `${row.label}: ${row.useHint}`;
  return gloss ? `${gloss} — ${formNote}` : formNote;
};

const buildExampleSentence = (
  form: string,
  row: InflectionRow,
  table: InflectionTable,
): string => {
  if (row.id === "plain" && table.kind === "na-adjective") {
    return `ここは${form}。`;
  }

  if (row.id === "plain" && table.kind === "i-adjective") {
    return `この部屋は${form}。`;
  }

  const template = SENTENCE_TEMPLATES[row.id];
  if (template) {
    return template(form);
  }

  return `例：${form}。`;
};

export const buildInflectionExamples = (
  rows: InflectionRow[],
  table: InflectionTable,
  wordMeaning = "",
): InflectionExampleDraft[] => {
  const examples: InflectionExampleDraft[] = [];

  for (const row of rows) {
    for (const form of row.forms) {
      examples.push({
        label: `${row.label} · ${form}`,
        sentence: buildExampleSentence(form, row, table),
        meaning: buildInflectionExampleMeaning(row, wordMeaning),
      });
    }
  }

  return examples;
};

export const mergeInflectionExamples = (
  existing: UserNoteExample[],
  incoming: UserNoteExample[],
): UserNoteExample[] => {
  const seen = new Set(existing.map((example) => example.sentence));
  const merged = [...existing];

  for (const example of incoming) {
    if (seen.has(example.sentence)) {
      continue;
    }
    seen.add(example.sentence);
    merged.push(example);
  }

  return merged;
};
