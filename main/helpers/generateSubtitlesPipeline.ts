import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as OpenCC from "opencc-js";
import {
  ASR_CHUNK_SECONDS,
  ASR_CONCURRENCY,
  ASR_REQUEST_TIMEOUT_MS,
  asrLanguageForAppLang,
  maxCueCharsForAppLang,
  shouldConvertToTraditional,
  subtitleFileTagForAppLang
} from "../../renderer/utils/generateSubtitlesConfig";
import type {GenerateSubtitlesProgress} from "../../renderer/types/generateSubtitles";
import {transcribeOpenRouterAudio, withRetries} from "./openRouterHttp";
import {throwIfAborted} from "./runCommand";
import {cuesFromTranscription, cuesToSrt, SrtCue} from "./srtFormat";
import {extractAudioChunk, extractAudioForAsr} from "./subtitleAudioExtract";

type ProgressFn = (progress: GenerateSubtitlesProgress) => void;

const toHongKongTraditional = OpenCC.Converter({from: "cn", to: "hk"});

/**
 * Runs `fn` over `items`, `limit` at a time, in order of results. The first failure aborts the
 * signal given to the others, so their in-flight requests stop instead of being paid for.
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  fn: (item: T, index: number, signal: AbortSignal) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let firstError: unknown;
  const failed = new AbortController();
  const workSignal = AbortSignal.any([signal, failed.signal]);

  const worker = async () => {
    while (true) {
      throwIfAborted(signal);
      if (firstError) {
        throw firstError;
      }
      const index = next++;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await fn(items[index], index, workSignal);
      } catch (error) {
        if (!firstError) {
          firstError = error;
          failed.abort();
        }
        throw firstError;
      }
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({length: workerCount}, () => worker()));
  return results;
}

const convertAsrText = (lang: string, text: string) => {
  if (!text) {
    return text;
  }
  return shouldConvertToTraditional(lang) ? toHongKongTraditional(text) : text;
};

export function buildSourceSrtPath(outputDir: string, stem: string, lang: string): string {
  return path.join(outputDir, `${stem}.${subtitleFileTagForAppLang(lang)}.srt`);
}

export async function generateSourceSubtitles(options: {
  videoPath: string;
  lang: string;
  asrModel: string;
  apiKey: string;
  outputDir: string;
  signal: AbortSignal;
  onProgress: ProgressFn;
}): Promise<{sourceSrtPath: string; cueCount: number}> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-asr-"));
  try {
    throwIfAborted(options.signal);
    options.onProgress({
      stage: "converting",
      message: "Extracting audio…",
      percent: 0
    });

    const extracted = await extractAudioForAsr({
      videoPath: options.videoPath,
      workDir,
      signal: options.signal,
      onProgress: (progress) => {
        options.onProgress({
          stage: "converting",
          message: progress.message,
          percent: progress.percent
        });
      }
    });

    const chunkSeconds = ASR_CHUNK_SECONDS;
    const chunkCount = Math.max(1, Math.ceil(extracted.duration / chunkSeconds));
    const chunks = Array.from({length: chunkCount}, (_, index) => {
      const start = index * chunkSeconds;
      const length = Math.min(chunkSeconds, extracted.duration - start);
      return {index, start, length};
    }).filter((chunk) => chunk.length >= 0.3);
    if (chunks.length === 0) {
      chunks.push({index: 0, start: 0, length: extracted.duration});
    }

    options.onProgress({
      stage: "transcribing",
      message: `Transcribing 0/${chunks.length}…`,
      percent: 0,
      current: 0,
      total: chunks.length
    });

    let completed = 0;
    const language = asrLanguageForAppLang(options.lang);
    const maxChars = maxCueCharsForAppLang(options.lang);
    const cueGroups = await mapLimit(chunks, ASR_CONCURRENCY, options.signal, async (chunk, _index, signal) => {
      const chunkPath = path.join(workDir, `chunk-${String(chunk.index).padStart(3, "0")}.mp3`);
      await extractAudioChunk({
        inputPath: extracted.audioPath,
        outputPath: chunkPath,
        start: chunk.start,
        length: chunk.length,
        signal
      });
      const audioBase64 = await fs.readFile(chunkPath, {encoding: "base64"});
      await fs.unlink(chunkPath).catch(() => undefined);

      const body = await withRetries(() => transcribeOpenRouterAudio({
        apiKey: options.apiKey,
        model: options.asrModel,
        audioBase64,
        format: "mp3",
        language,
        signal,
        timeoutMs: ASR_REQUEST_TIMEOUT_MS
      }), {signal});

      completed += 1;
      options.onProgress({
        stage: "transcribing",
        message: `Transcribing ${completed}/${chunks.length}…`,
        percent: Math.round((completed / chunks.length) * 100),
        current: completed,
        total: chunks.length
      });

      return cuesFromTranscription(body, chunk.start, {
        convertText: (text) => convertAsrText(options.lang, text),
        maxChars
      });
    });

    const cues: SrtCue[] = cueGroups.flat();
    if (cues.length === 0) {
      throw new Error("Transcription returned no subtitle cues");
    }

    options.onProgress({
      stage: "saving",
      message: "Writing subtitle file…",
      percent: 100
    });

    await fs.mkdir(options.outputDir, {recursive: true});
    const sourceSrtPath = buildSourceSrtPath(options.outputDir, extracted.stem, options.lang);
    await fs.writeFile(sourceSrtPath, cuesToSrt(cues), "utf8");

    options.onProgress({
      stage: "done",
      message: `Saved ${cues.length} cues`,
      percent: 100,
      sourceSrtPath
    });

    return {sourceSrtPath, cueCount: cues.length};
  } finally {
    await fs.rm(workDir, {recursive: true, force: true}).catch(() => undefined);
  }
}
