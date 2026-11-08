import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash, randomUUID} from "node:crypto";
import * as OpenCC from "opencc-js";
import type {YoutubeTranscriptionSegmentRequest} from "../../renderer/types/youtubeTranscription";
import {parseYoutubeVideoId} from "../../renderer/utils/utils";
import {
  asrLanguageForAppLang, DEFAULT_ASR_MODEL, isKnownAsrModel,
  maxCueCharsForAppLang, shouldConvertToTraditional
} from "../../renderer/utils/generateSubtitlesConfig";
import {openRouterMessages} from "../../renderer/utils/openRouterConstants";
import {requireMediaTool} from "../handler/common/mediaTools";
import {transcribeOpenRouterAudio, withRetries} from "./openRouterHttp";
import {cuesFromTranscription, type TranscriptionBody} from "./srtFormat";
import type {SubtitleEntry} from "./subtitleParser";
import {JobCancelledError, runCommand, throwIfAborted} from "./runCommand";

const CACHE_VERSION = 1;
const AUDIO_URL_LIFETIME_MS = 15 * 60_000;
const MAX_SEGMENT_SECONDS = 90;
const MAX_AUDIO_BYTES = 1_500_000;
const SEGMENT_TIMEOUT_MS = 180_000;
const toTraditional = OpenCC.Converter({from: "cn", to: "hk"});

export type YoutubeAudioSource = {
  url: string;
  headers: Record<string, string>;
  duration?: number;
  isLive?: boolean;
};

type NormalizedRequest = YoutubeTranscriptionSegmentRequest & {videoID: string};
type ExtractOptions = {
  audio: YoutubeAudioSource;
  start: number;
  duration: number;
  outputPath: string;
  signal: AbortSignal;
  boundedHttpRequests?: boolean;
};

export function validateYoutubeSegmentRequest(request: YoutubeTranscriptionSegmentRequest): NormalizedRequest {
  const videoID = parseYoutubeVideoId(request?.videoPath);
  if (!videoID) throw new Error("Load a YouTube video before starting transcription.");
  const lang = String(request?.lang ?? "").trim();
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(lang)) throw new Error("Learning language is not set or is invalid.");
  const asrModel = request?.asrModel || DEFAULT_ASR_MODEL;
  if (!isKnownAsrModel(asrModel)) throw new Error("Choose a supported timestamped transcription model.");
  if (!Number.isFinite(request?.startSeconds) || request.startSeconds < 0 || request.startSeconds > 1_000_000_000) {
    throw new Error("The transcription start time must be a finite, non-negative number.");
  }
  if (!Number.isFinite(request?.durationSeconds) || request.durationSeconds < 0.3 || request.durationSeconds > MAX_SEGMENT_SECONDS) {
    throw new Error(`Transcription segments must be between 0.3 and ${MAX_SEGMENT_SECONDS} seconds.`);
  }
  const requestId = String(request?.requestId ?? "").trim();
  if (!requestId || requestId.length > 200) throw new Error("A transcription request id is required.");
  return {...request, videoID, lang, asrModel, requestId,
    startSeconds: Math.round(request.startSeconds * 1000) / 1000,
    durationSeconds: Math.round(request.durationSeconds * 1000) / 1000};
}

/** Both the input and output are bounded; -ss before -i seeks over the earlier audio. */
export function buildYoutubeSegmentFfmpegArgs(options: Omit<ExtractOptions, "signal">): string[] {
  const headers = Object.entries(options.audio.headers ?? {})
    .filter(([name, value]) => /^[A-Za-z0-9-]+$/.test(name) && typeof value === "string" && !/[\r\n]/.test(value))
    .map(([name, value]) => `${name}: ${value}\r\n`).join("");
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-rw_timeout", "15000000",
    ...(options.boundedHttpRequests ? ["-request_size", "1048576", "-short_seek_size", "1048576", "-multiple_requests", "1"] : []),
    ...(headers ? ["-headers", headers] : []),
    "-ss", options.start.toFixed(3), "-t", options.duration.toFixed(3),
    "-i", options.audio.url,
    "-t", options.duration.toFixed(3), "-map", "0:a:0", "-vn", "-sn", "-dn",
    "-ac", "1", "-ar", "16000", "-b:a", "64k", "-fs", String(MAX_AUDIO_BYTES),
    options.outputPath
  ];
}

const validAudioSource = (source: YoutubeAudioSource): boolean => Boolean(source && /^https?:\/\//i.test(source.url)
  && source.headers && typeof source.headers === "object" && !source.isLive);

async function resolveYoutubeAudio(videoID: string, signal: AbortSignal): Promise<YoutubeAudioSource> {
  const command = await requireMediaTool("yt-dlp");
  throwIfAborted(signal);
  const {stdout} = await runCommand(command, [
    "--no-playlist", "--no-warnings", "--skip-download",
    // Indexed audio containers or HLS can seek directly to an upcoming segment. A generic
    // MP3 fallback may scan every earlier frame, defeating the bounded-download requirement.
    "-f", "ba[protocol^=m3u8]/ba[ext=m4a]/ba[ext=webm]",
    "-S", "proto:m3u8_native",
    "--print", "%(.{url,http_headers,duration,is_live,live_status})j",
    `https://www.youtube.com/watch?v=${videoID}`
  ], {signal, timeoutMs: 30_000});
  const info = JSON.parse(stdout);
  const source: YoutubeAudioSource = {
    url: info.url, headers: info.http_headers ?? {},
    duration: Number.isFinite(info.duration) && info.duration > 0 ? info.duration : undefined,
    isLive: Boolean(info.is_live || info.live_status === "is_live" || info.live_status === "post_live")
  };
  if (source.isLive) throw new Error("Ahead transcription currently supports recorded YouTube videos. Try again after this stream has finished processing.");
  if (!validAudioSource(source)) throw new Error("YouTube did not provide a seekable audio stream.");
  return source;
}

const boundedRequestSupport = new Map<string, boolean>();
async function extractYoutubeAudioSegment(options: ExtractOptions) {
  const command = await requireMediaTool("ffmpeg");
  throwIfAborted(options.signal);
  // Newer FFmpeg can issue bounded HTTP ranges, avoiding YouTube's rejection of open-ended
  // requests. Older installations keep their normal indexed seeking without unsupported flags.
  if (!boundedRequestSupport.has(command)) {
    const {stdout} = await runCommand(command, ["-hide_banner", "-h", "protocol=http"], {signal: options.signal, timeoutMs: 5000});
    boundedRequestSupport.set(command, /\s-request_size\s/.test(stdout));
  }
  const {stderr} = await runCommand(command, buildYoutubeSegmentFfmpegArgs({...options, boundedHttpRequests: boundedRequestSupport.get(command)}), {
    signal: options.signal, timeoutMs: 45_000
  });
  if (/could not seek|failed to seek|not seekable/i.test(stderr)) throw new Error("YouTube audio could not seek to the requested segment.");
}

type TranscriberOptions = {
  cacheDir: string;
  resolveAudio?: typeof resolveYoutubeAudio;
  extractAudio?: typeof extractYoutubeAudioSegment;
  transcribeAudio?: typeof transcribeOpenRouterAudio;
  now?: () => number;
};

type SharedJob = {
  abort: AbortController;
  promise: Promise<SubtitleEntry[]>;
  users: number;
  settled: boolean;
};

/** A factory keeps one shared request per segment; individual subscribers may cancel independently. */
export function createYoutubeSegmentTranscriber(options: TranscriberOptions) {
  const resolveAudio = options.resolveAudio ?? resolveYoutubeAudio;
  const extractAudio = options.extractAudio ?? extractYoutubeAudioSegment;
  const transcribeAudio = options.transcribeAudio ?? transcribeOpenRouterAudio;
  const now = options.now ?? Date.now;
  const active = new Map<string, SharedJob>();
  const audioSources = new Map<string, {expires: number; source: YoutubeAudioSource}>();
  const sourceDir = path.join(options.cacheDir, "audio-sources");
  const segmentDir = path.join(options.cacheDir, "segments");

  const writeJson = async (filename: string, data: unknown, signal: AbortSignal) => {
    throwIfAborted(signal);
    await fs.mkdir(path.dirname(filename), {recursive: true});
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(data), "utf8");
      throwIfAborted(signal);
      await fs.rename(temporary, filename);
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  };

  const sourceForVideo = async (videoID: string, signal: AbortSignal, refresh = false): Promise<YoutubeAudioSource> => {
    const filename = path.join(sourceDir, `${videoID}.json`);
    let saved = refresh ? undefined : audioSources.get(videoID);
    if (!saved && !refresh) {
      try {
        const disk = JSON.parse(await fs.readFile(filename, "utf8"));
        if (disk.version === CACHE_VERSION && disk.videoID === videoID) saved = disk;
      } catch { /* A missing or damaged cache entry is resolved again. */ }
    }
    throwIfAborted(signal);
    if (saved && saved.expires > now() && validAudioSource(saved.source)) {
      audioSources.set(videoID, saved);
      return saved.source;
    }
    const source = await resolveAudio(videoID, signal);
    throwIfAborted(signal);
    if (!validAudioSource(source)) throw new Error(source?.isLive ? "Ahead transcription supports recorded YouTube videos." : "YouTube returned an invalid audio source.");
    const expiry = Number(new URL(source.url).searchParams.get("expire"));
    const expires = Math.min(now() + AUDIO_URL_LIFETIME_MS, expiry > 0 ? expiry * 1000 - 60_000 : Infinity);
    const entry = {version: CACHE_VERSION, videoID, expires, source};
    audioSources.set(videoID, entry);
    // Audio URLs are temporary and contain no API key; failures to cache cannot stop playback.
    await writeJson(filename, entry, signal).catch((error) => { throwIfAborted(signal); console.warn("[YouTube ASR] Audio URL cache unavailable:", error.message); });
    return source;
  };

  const transcribe = async (request: NormalizedRequest, key: string, apiKey: string, signal: AbortSignal) => {
    const filename = path.join(segmentDir, `${key}.json`);
    try {
      const cached = JSON.parse(await fs.readFile(filename, "utf8"));
      throwIfAborted(signal);
      const startMs = Math.round(request.startSeconds * 1000);
      const endMs = Math.round((request.startSeconds + request.durationSeconds) * 1000);
      if (cached.version === CACHE_VERSION && cached.key === key && Array.isArray(cached.entries)
        && cached.entries.every((cue: SubtitleEntry) => typeof cue.id === "string" && typeof cue.text === "string"
          && Number.isFinite(cue.from) && Number.isFinite(cue.to) && cue.from >= startMs && cue.to <= endMs && cue.to > cue.from)) {
        return cached.entries as SubtitleEntry[];
      }
    } catch { throwIfAborted(signal); }
    if (!apiKey.trim()) throw new Error(openRouterMessages.missingApiKey);
    throwIfAborted(signal);
    const audio = await sourceForVideo(request.videoID, signal);
    const duration = Math.min(request.durationSeconds, audio.duration == null ? Infinity : Math.max(0, audio.duration - request.startSeconds));
    let entries: SubtitleEntry[] = [];
    if (duration >= 0.3) {
      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-youtube-asr-"));
      try {
        const outputPath = path.join(workDir, "segment.mp3");
        const extract = (source: YoutubeAudioSource) => extractAudio({audio: source, start: request.startSeconds, duration, outputPath, signal});
        try {
          await extract(audio);
        } catch (error) {
          throwIfAborted(signal);
          if (!/\b(?:401|403|410)\b|expired|signature/i.test(error instanceof Error ? error.message : String(error))) throw error;
          await extract(await sourceForVideo(request.videoID, signal, true));
        }
        throwIfAborted(signal);
        const size = (await fs.stat(outputPath)).size;
        if (size <= 0 || size > MAX_AUDIO_BYTES) throw new Error("The extracted audio segment is empty or exceeds the upload limit.");
        const audioBase64 = await fs.readFile(outputPath, {encoding: "base64"});
        const body: TranscriptionBody = await withRetries(() => transcribeAudio({
          apiKey, model: request.asrModel, audioBase64, format: "mp3",
          language: asrLanguageForAppLang(request.lang), signal, timeoutMs: 90_000
        }), {attempts: 2, delayMs: 500, signal});
        throwIfAborted(signal);
        const endMs = Math.round((request.startSeconds + duration) * 1000);
        const startMs = Math.round(request.startSeconds * 1000);
        entries = cuesFromTranscription({...body, duration: body.duration ?? duration}, 0, {
          maxChars: maxCueCharsForAppLang(request.lang),
          convertText: (text) => shouldConvertToTraditional(request.lang) ? toTraditional(text) : text
        }).flatMap((cue, index) => {
          const from = Math.max(startMs, Math.round((request.startSeconds + cue.start) * 1000));
          const to = Math.min(endMs, Math.round((request.startSeconds + cue.end) * 1000));
          return Number.isFinite(from) && Number.isFinite(to) && to > from && cue.text.trim()
            ? [{id: `youtube-asr-${request.videoID}-${key.slice(0, 12)}-${index}`, from, to, text: cue.text}] : [];
        });
      } finally {
        // workDir is generated by mkdtemp under the system temp folder, never taken from a request.
        await fs.rm(workDir, {recursive: true, force: true}).catch(() => undefined);
      }
    }
    throwIfAborted(signal);
    // An empty list is a completed silent segment and must not trigger another paid request.
    await writeJson(filename, {version: CACHE_VERSION, key, entries}, signal)
      .catch((error) => { throwIfAborted(signal); console.warn("[YouTube ASR] Transcript cache unavailable:", error.message); });
    throwIfAborted(signal);
    return entries;
  };

  const transcribeSegment = (input: YoutubeTranscriptionSegmentRequest, apiKey: string, signal?: AbortSignal): Promise<SubtitleEntry[]> => {
    try { throwIfAborted(signal); } catch (error) { return Promise.reject(error); }
    let request: NormalizedRequest;
    try { request = validateYoutubeSegmentRequest(input); } catch (error) { return Promise.reject(error); }
    const key = createHash("sha256").update(JSON.stringify([CACHE_VERSION, request.videoID, request.lang, request.asrModel,
      request.startSeconds, request.durationSeconds])).digest("hex");
    let job = active.get(key);
    if (!job || job.abort.signal.aborted) {
      if (active.size >= 3) return Promise.reject(new Error("Too many transcription segments are already running."));
      const abort = new AbortController();
      job = {abort, users: 0, settled: false, promise: undefined};
      const ownJob = job;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, SEGMENT_TIMEOUT_MS);
      ownJob.promise = transcribe(request, key, apiKey, abort.signal).catch((error) => {
        if (timedOut) throw new Error("The transcription segment timed out. Try this section again.");
        throw error;
      }).finally(() => {
        clearTimeout(timeout);
        ownJob.settled = true;
        if (active.get(key) === ownJob) active.delete(key);
      });
      ownJob.promise.catch(() => undefined);
      active.set(key, ownJob);
    }
    const shared = job;
    shared.users++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error?: unknown, entries?: SubtitleEntry[]) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        shared.users--;
        if (!shared.settled && shared.users === 0) {
          if (active.get(key) === shared) active.delete(key);
          shared.abort.abort();
        }
        if (error) reject(error);
        else resolve(entries);
      };
      const onAbort = () => finish(new JobCancelledError());
      signal?.addEventListener("abort", onAbort, {once: true});
      if (signal?.aborted) onAbort();
      shared.promise.then((entries) => finish(undefined, entries), (error) => finish(error));
    });
  };
  return {transcribeSegment};
}
