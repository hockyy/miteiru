import {ipcMain} from "electron";
import {spawn} from "child_process";
import os from "os";
import path from "path";
import fs from "fs/promises";
import {getSubtitles, getYoutubeVideoTitle} from "../../helpers/getSubtitles";
import {listYoutubeCaptionTracks} from "../../helpers/youtubeCaptions";
import {requireMediaTool} from "./mediaTools";

// YouTube video ids and subtitle language codes (en, en-US, zh-Hant, ja-orig, ...).
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const SUBTITLE_LANGUAGE = /^[A-Za-z0-9_-]{1,40}$/;

// What went wrong, from yt-dlp's stderr: its last ERROR: line, not the whole dump.
const ytDlpErrorMessage = (stderr: string, code: number | null) => {
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const message = [...lines].reverse().find((line) => line.startsWith("ERROR:")) ?? lines[lines.length - 1];
  return message ? message.replace(/^ERROR:\s*/, "") : `yt-dlp exited with code ${code}`;
};

const runYtDlp = (ytDlpPath: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(ytDlpPath, args);
  // The JSON listing can be several MB: collect the chunks and decode once.
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (data) => stdout.push(data));
  child.stderr.on("data", (data) => stderr.push(data));
  child.on("error", (err) => reject(new Error(`Failed to run yt-dlp: ${err.message}`)));
  child.on("close", (code) => {
    if (code === 0) {
      resolve(Buffer.concat(stdout).toString("utf8"));
    } else {
      reject(new Error(ytDlpErrorMessage(Buffer.concat(stderr).toString("utf8"), code)));
    }
  });
});

export function registerYoutubeHandlers() {
  ipcMain.handle("getYoutubeSubtitleLanguages", async (event, videoID) => {
    console.log(`[IPC] getYoutubeSubtitleLanguages called for ${videoID}`);
    try {
      if (!YOUTUBE_VIDEO_ID.test(String(videoID))) throw new Error(`Invalid YouTube video id: ${videoID}`);
      const ytDlpPath = await requireMediaTool("yt-dlp");

      const output = await runYtDlp(ytDlpPath, [
        "-J",
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        `https://youtube.com/watch?v=${videoID}`
      ]);
      let info;
      try {
        info = JSON.parse(output);
      } catch {
        throw new Error("yt-dlp returned caption data that could not be read.");
      }
      const languages = listYoutubeCaptionTracks(info);

      console.log(`[IPC] Found ${languages.length} available subtitle languages for ${videoID}`);
      return {languages};
    } catch (error) {
      console.error(`[IPC] Error getting YouTube subtitle languages for ${videoID}:`, error);
      return {languages: [], error: error.message};
    }
  });

  ipcMain.handle("downloadYoutubeSubtitle", async (event, videoID, lang) => {
    console.log(`[IPC] downloadYoutubeSubtitle called for ${videoID} (${lang})`);
    try {
      if (!YOUTUBE_VIDEO_ID.test(String(videoID)) || !SUBTITLE_LANGUAGE.test(String(lang))) {
        throw new Error(`Invalid YouTube video id or language: ${videoID} (${lang})`);
      }
      const ytDlpPath = await requireMediaTool("yt-dlp");
      // A fresh folder per download: scanning the shared temp folder could pick up an older
      // file for the same video, or en-US when en was asked for.
      const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru_youtube_"));
      const outputBase = path.join(tempDirPath, `${videoID}_${lang}`);

      const extractArgs = [
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs", lang,
        "--sub-format", "srt/vtt",
        "--skip-download",
        "--output", outputBase,
        `https://youtube.com/watch?v=${videoID}`
      ];

      console.log("[IPC] Running yt-dlp with args:", extractArgs);

      await runYtDlp(ytDlpPath, extractArgs);

      const files = await fs.readdir(tempDirPath);
      // srt when YouTube offers it, otherwise vtt; Miteiru's parser reads both.
      const downloadedFile = files.find((file) => file.endsWith(".srt")) ?? files.find((file) => file.endsWith(".vtt"));

      if (!downloadedFile) {
        console.log("[IPC] Available files:", files);
        throw new Error(`Could not find downloaded subtitle file for ${videoID} (${lang})`);
      }

      const actualFilePath = path.join(tempDirPath, downloadedFile);
      console.log(`[IPC] YouTube subtitle downloaded to: ${actualFilePath}`);

      return {
        success: true,
        filePath: actualFilePath,
        language: lang
      };
    } catch (error) {
      console.error(`[IPC] Error downloading YouTube subtitle for ${videoID} (${lang}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle("getYoutubeSubtitle", async (event, videoID, lang) => {
    try {
      return await getSubtitles({
        videoID,
        lang
      });
    } catch (error) {
      console.error("Error fetching subtitles:", error);
      return [];
    }
  });

  ipcMain.handle("getYoutubeVideoTitle", async (_event, videoID: string) => {
    try {
      return await getYoutubeVideoTitle(videoID);
    } catch (error) {
      console.error(`[IPC] Error getting YouTube title for ${videoID}:`, error);
      return null;
    }
  });
}
