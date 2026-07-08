/**
 * OpenRouter prompts for MeaningBox inflection example sentences.
 */
import type { InflectionKind } from "../../main/handler/languages/inflectionTypes";
import type { InflectionRow } from "../../main/handler/languages/inflectionTypes";
import { normalizeUserNoteExample, type UserNoteExample } from "../hooks/useUserNotes";

export type InflectionFormSpec = {
  form: string;
  label: string;
  useHint: string;
};

export const flattenInflectionRows = (rows: InflectionRow[]): InflectionFormSpec[] =>
  rows.flatMap((row) =>
    row.forms.map((form) => ({
      form,
      label: row.label,
      useHint: row.useHint,
    })),
  );

export function buildInflectionExampleMeaning(
  label: string,
  form: string,
  english: string,
  wordMeaning = "",
): string {
  const head = `${label} · ${form}`;
  const gloss = wordMeaning.trim();
  return gloss ? `${head} — ${gloss}: ${english}` : `${head}: ${english}`;
}

export function isInflectionExample(meaning: string): boolean {
  return meaning.includes(" · ");
}

export const filterInflectionExamples = (examples: UserNoteExample[]): UserNoteExample[] =>
  examples.filter((example) => isInflectionExample(example.meaning));

export function parseInflectionExampleKey(
  meaning: string,
): { label: string; form: string } | null {
  const head = meaning.split(" — ")[0]?.trim() ?? "";
  const [label, form] = head.split(" · ");
  if (!label?.trim() || !form?.trim()) {
    return null;
  }
  return { label: label.trim(), form: form.trim() };
}

export const indexInflectionExamples = (
  examples: UserNoteExample[],
): Map<string, UserNoteExample> => {
  const map = new Map<string, UserNoteExample>();
  for (const example of examples) {
    const key = parseInflectionExampleKey(example.meaning);
    if (key) {
      map.set(`${key.label}::${key.form}`, example);
    }
  }
  return map;
};

export function buildInflectionExamplesSystemPrompt(): string {
  return `You are a Japanese tutor. Write one natural example sentence per conjugation form. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "examples": [
    {
      "form": "<exact conjugated surface form provided>",
      "label": "<exact label provided>",
      "sentence": "<natural Japanese sentence using that form>",
      "meaning": "<short English translation of the full sentence>"
    }
  ]
}

Rules:
- Return exactly one entry per requested form; keep "form" and "label" identical to the request.
- The requested surface form must appear in the Japanese sentence.
- Sentences must be Japanese only — no furigana, romaji, or English in "sentence".
- "meaning" must be natural English for the whole sentence (not just the word gloss).
- Keep sentences short and practical for speaking practice.
- Return valid JSON only.`;
}

export function buildInflectionExamplesUserPrompt(
  dictionaryForm: string,
  wordMeaning: string,
  kind: InflectionKind,
  forms: InflectionFormSpec[],
): string {
  const kindLabel =
    kind === "verb" ? "verb" : kind === "i-adjective" ? "i-adjective" : "na-adjective";

  const formList = forms
    .map(
      (entry, index) =>
        `${index + 1}. form="${entry.form}" label="${entry.label}" when_to_use="${entry.useHint}"`,
    )
    .join("\n");

  return `Dictionary form: ${dictionaryForm}
Part of speech: ${kindLabel}
English meaning: ${wordMeaning || "(unknown)"}

Write one example sentence for each conjugation below:
${formList}`;
}

export const parseInflectionExamplesResponse = (
  content: string,
  forms: InflectionFormSpec[],
  wordMeaning = "",
): UserNoteExample[] => {
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const noteData = JSON.parse(jsonStr);

    if (!Array.isArray(noteData.examples)) {
      return [];
    }

    const specsByKey = new Map(
      forms.map((spec) => [`${spec.label}::${spec.form}`, spec] as const),
    );

    const parsed = noteData.examples
      .map((value: unknown) => {
        if (!value || typeof value !== "object") {
          return null;
        }
        const record = value as {
          form?: unknown;
          label?: unknown;
          sentence?: unknown;
          meaning?: unknown;
        };
        const form = typeof record.form === "string" ? record.form.trim() : "";
        const label = typeof record.label === "string" ? record.label.trim() : "";
        const normalized = normalizeUserNoteExample({
          sentence: record.sentence,
          meaning: record.meaning,
        });
        if (!normalized || !form || !label) {
          return null;
        }

        const spec = specsByKey.get(`${label}::${form}`);
        if (!spec) {
          return null;
        }

        return {
          sentence: normalized.sentence,
          meaning: buildInflectionExampleMeaning(
            label,
            form,
            normalized.meaning,
            wordMeaning,
          ),
        };
      })
      .filter((example): example is UserNoteExample => Boolean(example?.sentence));

    return parsed;
  } catch {
    return [];
  }
};
