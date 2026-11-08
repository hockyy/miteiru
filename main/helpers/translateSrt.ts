import fs from "node:fs/promises";
import {
  TRANSLATE_BATCH_SIZE,
  TRANSLATE_CONCURRENCY,
  TRANSLATE_REQUEST_TIMEOUT_MS
} from "../../renderer/utils/generateSubtitlesConfig";
import {mapLimit} from "./mapLimit";
import type {GenerateSubtitlesProgress} from "../../renderer/types/generateSubtitles";
import {asString, extractJsonArray} from "../../renderer/utils/parseJsonResponse";
import {openRouterChatCompletion, withRetries} from "./openRouterHttp";
import {isJobCancelled, throwIfAborted} from "./runCommand";
import {cuesToSrt, parseSrtCues, siblingEnglishSrtPath, SrtCue} from "./srtFormat";

type ProgressFn = (progress: GenerateSubtitlesProgress) => void;

const translateSystemPrompt = (lang: string) => {
  const source =
    lang === "yue" ? "spoken Cantonese (粵語口語, not written Mandarin)"
      : lang === "ja" ? "Japanese"
        : lang === "zh-CN" ? "Chinese"
          : lang === "vi" ? "Vietnamese"
            : "the source language";

  return `You translate video subtitles into natural spoken English.
Rules:
- Source language: ${source}.
- Translate every numbered line. Keep the same numbers.
- One English line per input line. Do not merge or split cues.
- Keep names, titles, and already-English text.
- Preserve tone, including strong language. Do not sanitize.
- Output ONLY a JSON array: [{"i":1,"en":"..."}, ...] with every input index.
- No markdown, no commentary.`;
};

export function parseCueTranslations(raw: string): Map<number, string> {
  const json = extractJsonArray(raw);
  if (!json) {
    throw new Error("Translation response was not a JSON array");
  }
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Translation JSON was not an array");
  }
  const out = new Map<number, string>();
  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const index = Number((row as {i?: unknown}).i);
    const english = asString((row as {en?: unknown}).en);
    if (Number.isInteger(index) && english) {
      out.set(index, english);
    }
  }
  return out;
}

/**
 * Keeps the rows that number this batch's lines 1..batchLength and maps them to absolute cue numbers.
 * Rows with any other number (a model that kept counting from another batch) are ignored, so a
 * batch can never write over another batch's cues.
 */
export function batchTranslations(got: Map<number, string>, batchLength: number, startIndex: number) {
  const translations = new Map<number, string>();
  const missing: number[] = [];
  for (let i = 1; i <= batchLength; i++) {
    const english = got.get(i);
    if (english) translations.set(startIndex + i, english);
    else missing.push(startIndex + i);
  }
  return {translations, missing};
}

export async function translateSrtToEnglish(options: {
  sourceSrtPath: string;
  lang: string;
  translateModel: string;
  apiKey: string;
  signal: AbortSignal;
  onProgress: ProgressFn;
  /** The learner's 'openrouter.thinking' setting (openRouterChatCompletion). */
  thinking?: unknown;
}): Promise<{englishSrtPath: string}> {
  throwIfAborted(options.signal);
  const sourceText = await fs.readFile(options.sourceSrtPath, "utf8");
  const cues = parseSrtCues(sourceText);
  if (cues.length === 0) {
    throw new Error("No cues found in the generated subtitle");
  }

  const translations = new Map<number, string>();
  const batches: SrtCue[][] = [];
  for (let i = 0; i < cues.length; i += TRANSLATE_BATCH_SIZE) {
    batches.push(cues.slice(i, i + TRANSLATE_BATCH_SIZE));
  }

  options.onProgress({
    stage: "translating",
    message: `Translating 0/${cues.length}…`,
    percent: 0,
    current: 0,
    total: cues.length
  });

  let done = 0;
  // A few batches at a time; translations are keyed by cue number, so their order doesn't matter.
  await mapLimit(batches, TRANSLATE_CONCURRENCY, options.signal, async (batch, batchIndex, signal) => {
    const startIndex = batchIndex * TRANSLATE_BATCH_SIZE;
    // Numbered 1..N within the batch, like the prompt example, so the numbers the model returns can be trusted.
    const numbered = batch.map((cue, offset) => `${offset + 1}. ${cue.text}`).join("\n");

    // The best incomplete answer, used if every attempt leaves cues out (they keep their source text).
    let partial: Map<number, string> | null = null;
    const translated = await withRetries(async () => {
      const {content} = await openRouterChatCompletion({
        apiKey: options.apiKey,
        model: options.translateModel,
        temperature: 0.2,
        thinking: options.thinking,
        timeoutMs: TRANSLATE_REQUEST_TIMEOUT_MS,
        signal,
        messages: [
          {role: "system", content: translateSystemPrompt(options.lang)},
          {role: "user", content: numbered}
        ]
      });
      const mapped = batchTranslations(parseCueTranslations(content), batch.length, startIndex);
      if (mapped.missing.length) {
        if (!partial || mapped.translations.size > partial.size) partial = mapped.translations;
        throw new Error(`Missing translations for cues ${mapped.missing.slice(0, 8).join(", ")}`);
      }
      return mapped.translations;
    }, {signal}).catch((error) => {
      if (partial && !isJobCancelled(error)) return partial;
      throw error;
    });

    translated.forEach((text, index) => translations.set(index, text));
    done += batch.length;
    options.onProgress({
      stage: "translating",
      message: `Translating ${done}/${cues.length}…`,
      percent: Math.round((done / cues.length) * 100),
      current: done,
      total: cues.length,
      sourceSrtPath: options.sourceSrtPath
    });
  });
  throwIfAborted(options.signal);

  const englishCues = cues.map((cue, index) => ({
    ...cue,
    text: translations.get(index + 1) || cue.text
  }));
  const englishSrtPath = siblingEnglishSrtPath(options.sourceSrtPath);
  await fs.writeFile(englishSrtPath, cuesToSrt(englishCues), "utf8");

  options.onProgress({
    stage: "done",
    message: `Saved English subtitles (${englishCues.length} cues)`,
    percent: 100,
    sourceSrtPath: options.sourceSrtPath,
    englishSrtPath
  });

  return {englishSrtPath};
}
