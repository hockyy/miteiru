import fs from "node:fs/promises";
import {
  TRANSLATE_BATCH_SIZE,
  TRANSLATE_REQUEST_TIMEOUT_MS
} from "../../renderer/utils/generateSubtitlesConfig";
import type {GenerateSubtitlesProgress} from "../../renderer/types/generateSubtitles";
import {asString, extractJsonArray} from "../../renderer/utils/parseJsonResponse";
import {openRouterChatCompletion, withRetries} from "./openRouterHttp";
import {throwIfAborted} from "./runCommand";
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

export async function translateSrtToEnglish(options: {
  sourceSrtPath: string;
  lang: string;
  translateModel: string;
  apiKey: string;
  signal: AbortSignal;
  onProgress: ProgressFn;
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
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const startIndex = batchIndex * TRANSLATE_BATCH_SIZE;
    const numbered = batch.map((cue, offset) => `${startIndex + offset + 1}. ${cue.text}`).join("\n");

    const translated = await withRetries(async () => {
      const {content} = await openRouterChatCompletion({
        apiKey: options.apiKey,
        model: options.translateModel,
        temperature: 0.2,
        timeoutMs: TRANSLATE_REQUEST_TIMEOUT_MS,
        signal: options.signal,
        messages: [
          {role: "system", content: translateSystemPrompt(options.lang)},
          {role: "user", content: numbered}
        ]
      });
      const got = parseCueTranslations(content);
      const missing = batch
        .map((_, offset) => startIndex + offset + 1)
        .filter((index) => !got.get(index));
      if (missing.length) {
        throw new Error(`Missing translations for cues ${missing.slice(0, 8).join(", ")}`);
      }
      return got;
    }, {signal: options.signal});

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
  }

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
