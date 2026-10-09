import fs from "node:fs/promises";
import path from "path";
import {isYoutube} from "../../renderer/utils/utils";
import {getYoutubeVideoId} from "../../renderer/utils/mediaUtils";
import {requireMediaTool} from "../handler/common/mediaTools";
import {normalizeLocalMediaPath} from "./localMediaPath";
import {runCommand, throwIfAborted} from "./runCommand";
import {getYoutubeVideoTitle} from "./getSubtitles";
import {sanitizeSubtitleStem} from "./srtFormat";

export type AudioExtractProgress = {
  message: string;
  percent?: number;
};

export type ExtractedAudio = {
  audioPath: string;
  duration: number;
  stem: string;
  sourceKind: "youtube" | "local";
};

const FFMPEG_TIME = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;
const YT_DLP_PERCENT = /\[download\]\s+(\d+(?:\.\d+)?)%/;

export const toFilesystemPath = normalizeLocalMediaPath;

const parseFfmpegTime = (text: string): number | null => {
  const match = FFMPEG_TIME.exec(text);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

const parseYtDlpPercent = (text: string): number | null => {
  const match = YT_DLP_PERCENT.exec(text);
  if (!match) {
    return null;
  }
  return Number(match[1]);
};

export async function probeDuration(filePath: string, signal?: AbortSignal): Promise<number> {
  const ffprobe = await requireMediaTool("ffprobe");
  const {stdout} = await runCommand(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    filePath
  ], {signal});
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read duration for ${filePath}`);
  }
  return duration;
}

export async function convertToAsrMp3(options: {
  inputPath: string;
  outputPath: string;
  signal?: AbortSignal;
  durationHint?: number;
  onProgress?: (progress: AudioExtractProgress) => void;
}): Promise<number> {
  const ffmpeg = await requireMediaTool("ffmpeg");
  options.onProgress?.({message: "Converting audio…", percent: 0});
  await runCommand(ffmpeg, [
    "-y",
    "-i", options.inputPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    options.outputPath
  ], {
    signal: options.signal,
    onStderr: (chunk) => {
      const time = parseFfmpegTime(chunk);
      if (time == null || !options.durationHint) {
        return;
      }
      options.onProgress?.({
        message: `Converting audio ${formatClock(time)}`,
        percent: Math.min(99, Math.round((time / options.durationHint) * 100))
      });
    }
  });
  return probeDuration(options.outputPath, options.signal);
}

export async function extractAudioChunk(options: {
  inputPath: string;
  outputPath: string;
  start: number;
  length: number;
  signal?: AbortSignal;
}) {
  const ffmpeg = await requireMediaTool("ffmpeg");
  await runCommand(ffmpeg, [
    "-y",
    "-ss", options.start.toFixed(3),
    "-t", options.length.toFixed(3),
    "-i", options.inputPath,
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    options.outputPath
  ], {signal: options.signal});
}

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const findDownloadedAudio = async (workDir: string) => {
  const files = await fs.readdir(workDir);
  const audio = files.find((name) => /^source\./i.test(name) && !name.endsWith(".mp3"));
  const fallback = files.find((name) => name.startsWith("source."));
  const chosen = audio || fallback;
  if (!chosen) {
    throw new Error("yt-dlp did not produce an audio file");
  }
  return path.join(workDir, chosen);
};

async function extractYoutubeAudio(options: {
  videoPath: string;
  workDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: AudioExtractProgress) => void;
}): Promise<ExtractedAudio> {
  const ytDlp = await requireMediaTool("yt-dlp");
  const videoId = getYoutubeVideoId(options.videoPath);
  if (!videoId) {
    throw new Error("Could not parse the YouTube video id");
  }
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(options.workDir, "source.%(ext)s");
  options.onProgress?.({message: "Downloading YouTube audio…", percent: 0});
  const titlePromise = getYoutubeVideoTitle(videoId);

  await runCommand(ytDlp, [
    "-f", "ba/b",
    "-o", outputTemplate,
    "--no-playlist",
    "--no-warnings",
    "--newline",
    url
  ], {
    signal: options.signal,
    onStdout: (chunk) => {
      const percent = parseYtDlpPercent(chunk);
      if (percent == null) {
        return;
      }
      options.onProgress?.({
        message: `Downloading YouTube audio ${percent.toFixed(0)}%`,
        percent: Math.min(90, percent)
      });
    },
    onStderr: (chunk) => {
      const percent = parseYtDlpPercent(chunk);
      if (percent == null) {
        return;
      }
      options.onProgress?.({
        message: `Downloading YouTube audio ${percent.toFixed(0)}%`,
        percent: Math.min(90, percent)
      });
    }
  });

  const downloaded = await findDownloadedAudio(options.workDir);
  const mp3Path = path.join(options.workDir, "asr.mp3");
  let durationHint: number | undefined;
  try {
    durationHint = await probeDuration(downloaded, options.signal);
  } catch {
    durationHint = undefined;
  }
  const duration = await convertToAsrMp3({
    inputPath: downloaded,
    outputPath: mp3Path,
    signal: options.signal,
    durationHint,
    onProgress: options.onProgress
  });

  const title = await titlePromise;
  const stem = sanitizeSubtitleStem(title ? `${videoId} ${title}` : videoId);
  return {
    audioPath: mp3Path,
    duration,
    stem,
    sourceKind: "youtube"
  };
}

async function extractLocalAudio(options: {
  videoPath: string;
  workDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: AudioExtractProgress) => void;
}): Promise<ExtractedAudio> {
  const inputPath = toFilesystemPath(options.videoPath);
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Video file not found: ${inputPath}`);
  }
  let durationHint: number | undefined;
  try {
    durationHint = await probeDuration(inputPath, options.signal);
  } catch {
    durationHint = undefined;
  }
  const mp3Path = path.join(options.workDir, "asr.mp3");
  const duration = await convertToAsrMp3({
    inputPath,
    outputPath: mp3Path,
    signal: options.signal,
    durationHint,
    onProgress: options.onProgress
  });
  const stem = sanitizeSubtitleStem(path.parse(inputPath).name);
  return {
    audioPath: mp3Path,
    duration,
    stem,
    sourceKind: "local"
  };
}

export async function extractAudioForAsr(options: {
  videoPath: string;
  workDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: AudioExtractProgress) => void;
}): Promise<ExtractedAudio> {
  throwIfAborted(options.signal);
  if (isYoutube(options.videoPath)) {
    return extractYoutubeAudio(options);
  }
  return extractLocalAudio(options);
}
