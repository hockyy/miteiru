import {ipcMain} from "electron";
import * as fsPromises from "node:fs/promises";
import {parse as parseSRT} from "@plussub/srt-vtt-parser";
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite";
import {MediaAnalyzer} from "../../helpers/mediaAnalyzer";

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

  ipcMain.handle("reencode-video-with-audio-track", async (event, inputPath, audioStreamIndex, convertToX264, totalDuration) => {
    console.log("[IPC] reencode-video-with-audio-track called:", {inputPath, audioStreamIndex, convertToX264, totalDuration});
    try {
      const toolsStatus = await MediaAnalyzer.checkToolsAvailable();
      if (!toolsStatus.ffmpeg) {
        throw new Error("FFmpeg not found. Please install FFmpeg and make sure it's in your PATH.");
      }

      const result = await MediaAnalyzer.reencodeVideoWithAudioTrack(
        inputPath,
        audioStreamIndex,
        convertToX264,
        totalDuration,
        (progress) => {
          console.log("[IPC] Sending progress to renderer:", progress);
          event.sender.send("reencode-progress", progress);
        }
      );
      console.log("[IPC] Video with audio track reencoded:", result);
      return result;
    } catch (error) {
      console.error("[IPC] Video audio track reencoding failed:", error);
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
