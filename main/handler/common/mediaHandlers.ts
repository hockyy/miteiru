import {ipcMain} from "electron";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {parse as parseSRT} from "@plussub/srt-vtt-parser";
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite";
import {MediaAnalyzer} from "../../helpers/mediaAnalyzer";

interface SubtitleEntry {
  id?: string;
  from: number;
  to: number;
  text: string;
}

interface HufWord {
  content?: string;
}

interface HufSentence {
  id?: string;
  startMs?: number;
  endMs?: number;
  words?: HufWord[];
}

interface HufDocument {
  format?: string;
  syncMs?: number;
  sentences?: HufSentence[];
  contents?: HufSentence[];
}

const appendHufWords = (words: HufWord[] = []) => {
  return words.map((word) => (typeof word?.content === "string" ? word.content : "")).join("");
};

const parseHufToEntries = (content: string): SubtitleEntry[] => {
  const parsed: HufDocument = JSON.parse(content);
  if (parsed?.format !== "holokara-unified-format") {
    throw new Error("Invalid HUF format");
  }

  const rawSentences = Array.isArray(parsed.sentences)
    ? parsed.sentences
    : (Array.isArray(parsed.contents) ? parsed.contents : []);
  const syncMs = Number.isFinite(parsed.syncMs) ? Number(parsed.syncMs) : 0;

  return rawSentences
    .map((sentence, index) => {
      const from = Number(sentence?.startMs);
      const to = Number(sentence?.endMs);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

      return {
        id: sentence?.id ?? `sentence-${(index + 1).toString().padStart(3, "0")}`,
        from: Math.trunc(from + syncMs),
        to: Math.trunc(to + syncMs),
        text: appendHufWords(sentence?.words)
      } as SubtitleEntry;
    })
    .filter((entry): entry is SubtitleEntry => entry !== null);
};

const parseLrcToEntries = (content: string): SubtitleEntry[] => {
  const lines = content.split("\n");
  const entries: SubtitleEntry[] = [];
  let id = 0;
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?]/g;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.match(/^\[[a-z]+:/)) continue;

    let match;
    const timestamps: number[] = [];
    let lastIndex = 0;
    timeRegex.lastIndex = 0;

    while ((match = timeRegex.exec(trimmedLine)) !== null) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, "0")) : 0;
      timestamps.push((minutes * 60 + seconds) * 1000 + milliseconds);
      lastIndex = match.index + match[0].length;
    }

    const text = trimmedLine.substring(lastIndex).trim();
    for (const timestamp of timestamps) {
      entries.push({
        id: (id++).toString(),
        from: timestamp,
        to: timestamp + 3000,
        text
      });
    }
  }

  entries.sort((a, b) => a.from - b.from);
  for (let i = 0; i < entries.length - 1; i++) {
    entries[i].to = entries[i + 1].from;
  }

  return entries.filter((entry) => entry.text.length > 0);
};

const parseAssTimestamp = (timestamp: string) => {
  const match = timestamp.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,2})$/);
  if (!match) return null;

  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const seconds = parseInt(match[3]);
  const centiseconds = parseInt(match[4].padEnd(2, "0"));

  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + centiseconds * 10;
};

const parseAssToEntries = (content: string): SubtitleEntry[] => {
  const entries: SubtitleEntry[] = [];
  let formatFields: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith("format:")) {
      formatFields = trimmedLine
        .slice("format:".length)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      continue;
    }

    if (!trimmedLine.toLowerCase().startsWith("dialogue:") || formatFields.length === 0) {
      continue;
    }

    const dialogue = trimmedLine.slice("dialogue:".length).trim();
    const parts = dialogue.split(",", formatFields.length);
    if (parts.length < formatFields.length) continue;

    const textIndex = formatFields.indexOf("text");
    const startIndex = formatFields.indexOf("start");
    const endIndex = formatFields.indexOf("end");
    if (textIndex === -1 || startIndex === -1 || endIndex === -1) continue;

    if (textIndex === formatFields.length - 1) {
      parts[textIndex] = dialogue.split(",").slice(textIndex).join(",");
    }

    const from = parseAssTimestamp(parts[startIndex]);
    const to = parseAssTimestamp(parts[endIndex]);
    if (from === null || to === null) continue;

    entries.push({
      id: entries.length.toString(),
      from,
      to,
      text: parts[textIndex].replace(/\{\\.*?}/g, "").replace(/\\N/g, "\n")
    });
  }

  return entries;
};

const getSubtitleEntries = (filename: string, text: string): SubtitleEntry[] => {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.endsWith(".ass")) {
    return parseAssToEntries(text);
  }

  if (lowerFilename.endsWith(".lrc")) {
    return parseLrcToEntries(text);
  }

  const isLikelyHuf = () => {
    if (lowerFilename.endsWith(".huf")) return true;
    if (!lowerFilename.endsWith(".json")) return false;
    try {
      return JSON.parse(text)?.format === "holokara-unified-format";
    } catch (error) {
      return false;
    }
  };

  if (isLikelyHuf()) {
    return parseHufToEntries(text);
  }

  return parseSRT(text).entries;
};

const normalizeCapitalization = (text: string) => {
  return text.toLowerCase().replace(/[a-z]/, (letter) => letter.toUpperCase());
};

const formatSrtTimestamp = (milliseconds: number) => {
  const normalizedMs = Math.max(0, Math.trunc(milliseconds));
  const ms = normalizedMs % 1000;
  const totalSeconds = Math.floor(normalizedMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
};

const entriesToSrt = (entries: SubtitleEntry[]) => {
  return entries
    .map((entry, index) => {
      const text = normalizeCapitalization(entry.text ?? "").replace(/\r?\n/g, "\n");
      return [
        (index + 1).toString(),
        `${formatSrtTimestamp(entry.from)} --> ${formatSrtTimestamp(entry.to)}`,
        text
      ].join("\n");
    })
    .join("\n\n") + "\n";
};

export function registerMediaHandlers() {
  ipcMain.handle("fs-readFile", async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      return buffer.toString("base64");
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle("fs-writeFile", async (event, filename, data) => {
    try {
      await fsPromises.writeFile(filename, Buffer.from(data, "base64"));
      return true;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle("parse-subtitle", async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      const currentData = await languageEncoding(buffer);
      const text = iconv.decode(buffer, currentData.encoding);
      const lowerFilename = filename.toLowerCase();

      const isLikelyHuf = () => {
        if (lowerFilename.endsWith(".huf")) return true;
        if (!lowerFilename.endsWith(".json")) return false;
        try {
          const parsed = JSON.parse(text);
          return parsed?.format === "holokara-unified-format";
        } catch (error) {
          return false;
        }
      };

      if (lowerFilename.endsWith(".ass")) {
        return {
          type: "ass",
          content: text
        };
      } else if (lowerFilename.endsWith(".lrc")) {
        return {
          type: "lrc",
          content: text
        };
      } else if (isLikelyHuf()) {
        return {
          type: "huf",
          content: text
        };
      } else {
        return {
          type: "srt",
          content: parseSRT(text)
        };
      }
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle("preprocess-subtitle-capitalization", async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      const currentData = await languageEncoding(buffer);
      const text = iconv.decode(buffer, currentData.encoding);
      const entries = getSubtitleEntries(filename, text);
      const safeBaseName = path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9._-]/g, "_");
      const outputPath = path.join(os.tmpdir(), `miteiru_normalized_${safeBaseName}_${Date.now()}.srt`);

      await fsPromises.writeFile(outputPath, entriesToSrt(entries), "utf8");
      console.log("[IPC] Subtitle capitalization preprocessed:", outputPath);
      return outputPath;
    } catch (error) {
      console.error("[IPC] Subtitle capitalization preprocessing failed:", error);
      throw error;
    }
  });

  ipcMain.handle("analyze-media-file", async (event, filePath) => {
    console.log("[IPC] analyze-media-file called with:", filePath);
    try {
      const result = await MediaAnalyzer.analyzeFile(filePath);
      console.log("[IPC] analyze-media-file result:", result);
      return result;
    } catch (error) {
      console.error("[IPC] Media analysis failed:", error);

      const fallbackResult = {
        duration: 0,
        audioTracks: [],
        subtitleTracks: [],
        videoTracks: [],
        error: error.message,
        toolsAvailable: false
      };
      console.log("[IPC] Returning fallback result:", fallbackResult);
      return fallbackResult;
    }
  });

  ipcMain.handle("extract-embedded-subtitle", async (event, inputPath, streamIndex, outputFormat = "srt") => {
    console.log(`[IPC] extract-embedded-subtitle called: ${inputPath}, stream ${streamIndex}, format ${outputFormat}`);
    try {
      const toolsStatus = await MediaAnalyzer.checkToolsAvailable();
      if (!toolsStatus.ffmpeg) {
        throw new Error("FFmpeg not found. Please install FFmpeg and make sure it's in your PATH.");
      }

      const result = await MediaAnalyzer.extractSubtitle(inputPath, streamIndex, outputFormat);
      console.log("[IPC] Subtitle extracted successfully:", result);
      return result;
    } catch (error) {
      console.error("[IPC] Subtitle extraction failed:", error);
      throw error;
    }
  });

  ipcMain.handle("reencode-video-with-audio-track", async (event, inputPath, audioStreamIndex, convertToX264, convertAudioToAac, totalDuration) => {
    console.log("[IPC] reencode-video-with-audio-track called:", {inputPath, audioStreamIndex, convertToX264, convertAudioToAac, totalDuration});
    try {
      const toolsStatus = await MediaAnalyzer.checkToolsAvailable();
      if (!toolsStatus.ffmpeg) {
        throw new Error("FFmpeg not found. Please install FFmpeg and make sure it's in your PATH.");
      }

      const result = await MediaAnalyzer.reencodeVideoWithAudioTrack(
        inputPath,
        audioStreamIndex,
        convertToX264,
        convertAudioToAac,
        totalDuration,
        (progress) => {
          console.log("[IPC] Sending progress to renderer:", progress);
          event.sender.send("reencode-progress", progress);
        }
      );
      console.log("[IPC] Video with selected audio processed:", result);
      return result;
    } catch (error) {
      console.error("[IPC] Video audio track processing failed:", error);
      throw error;
    }
  });

  ipcMain.handle("cleanup-temp-subtitle", async (event, filePath) => {
    try {
      await MediaAnalyzer.cleanupTempFile(filePath);
    } catch (error) {
      console.error("Failed to cleanup temp file:", error);
    }
  });

  ipcMain.handle("checkFFmpegTools", async (event, forceRefresh = false) => {
    console.log("[Backward Compatibility] checkFFmpegTools called, using MediaAnalyzer directly");

    try {
      const ffmpegStatus = await MediaAnalyzer.checkToolsAvailable();
      const isAvailable = ffmpegStatus.ffmpeg && ffmpegStatus.ffprobe;

      return {
        ok: isAvailable ? 1 : 0,
        message: isAvailable
          ? "FFmpeg and FFprobe are available"
          : `Missing tools - FFmpeg: ${ffmpegStatus.ffmpeg ? "OK" : "Missing"}, FFprobe: ${ffmpegStatus.ffprobe ? "OK" : "Missing"}`,
        details: ffmpegStatus,
        cached: false
      };
    } catch (error) {
      return {
        ok: 0,
        message: `Error checking FFmpeg tools: ${error.message}`,
        details: {ffmpeg: false, ffprobe: false},
        cached: false
      };
    }
  });
}
