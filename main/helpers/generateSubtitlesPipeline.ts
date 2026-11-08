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
import {mapLimit} from "./mapLimit";
import {throwIfAborted} from "./runCommand";
import {cuesFromTranscription, cuesToSrt, SrtCue} from "./srtFormat";
import {extractAudioChunk, extractAudioForAsr} from "./subtitleAudioExtract";

type ProgressFn = (progress: GenerateSubtitlesProgress) => void;

const toHongKongTraditional = OpenCC.Converter({from: "cn", to: "hk"});

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
