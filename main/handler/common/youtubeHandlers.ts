import {ipcMain} from "electron";
import {spawn} from "child_process";
import os from "os";
import path from "path";
import fs from "fs/promises";
import {findBestLanguageMatch} from "../../helpers/getSubtitles";
import {listYoutubeCaptionTracks} from "../../helpers/youtubeCaptions";
import {downloadYoutubeCaption} from "../../helpers/youtubeCaptionDownload";
import {parseSubtitleCues} from "../../helpers/subtitleParser";
import {requireMediaTool} from "./mediaTools";
import {YOUTUBE_STREAM_FORMAT_ARGS, youtubeStreamSource} from "../../helpers/youtubeStream";

// YouTube video ids and subtitle language codes (en, en-US, zh-Hant, ja-orig, ...).
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const SUBTITLE_LANGUAGE = /^[A-Za-z0-9_-]{1,40}$/;

// What went wrong, from yt-dlp's stderr: its last ERROR: line, not the whole dump.
const ytDlpErrorMessage = (stderr: string, code: number | null) => {
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const message = [...lines].reverse().find((line) => line.startsWith("ERROR:")) ?? lines[lines.length - 1];
  return message ? message.replace(/^ERROR:\s*/, "") : `yt-dlp exited with code ${code}`;
};

const YT_DLP_TIMEOUT_MS = 120_000;

const runYtDlp =(ytDlpPath: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(ytDlpPath, args);
  // The JSON listing can be several MB: collect the chunks and decode once.
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  // A stalled yt-dlp would otherwise leave the subtitle picker loading forever.
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("yt-dlp did not finish within 2 minutes."));
  }, YT_DLP_TIMEOUT_MS);

  child.stdout.on("data", (data) => stdout.push(data));
  child.stderr.on("data", (data) => stderr.push(data));
  child.on("error", (err) => {
    clearTimeout(timer);
    reject(new Error(`Failed to run yt-dlp: ${err.message}`));
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code === 0) {
      resolve(Buffer.concat(stdout).toString("utf8"));
    } else {
      reject(new Error(ytDlpErrorMessage(Buffer.concat(stderr).toString("utf8"), code)));
    }
  });
});

/**
 * yt-dlp's `-J` description of a video: its streams (for mpv) and its caption tracks. Opening a
 * video asks for both, so one run serves them, kept for 20 minutes; the stream URLs it holds stay
 * valid for hours.
 */
const INFO_LIFETIME_MS = 20 * 60_000;
const youtubeInfoCache = new Map<string, { at: number; info: Promise<any> }>();

const youtubeInfo = (videoID: string): Promise<any> => {
  const now = Date.now();
  const cached = youtubeInfoCache.get(videoID);
  if (cached && now - cached.at < INFO_LIFETIME_MS) return cached.info;
  // Each entry holds a few MB of formats and caption tracks: drop the expired ones.
  for (const [id, entry] of youtubeInfoCache) {
    if (now - entry.at >= INFO_LIFETIME_MS) youtubeInfoCache.delete(id);
  }
  const info = (async () => {
    const ytDlpPath = await requireMediaTool("yt-dlp");
    const output = await runYtDlp(ytDlpPath, [
      "-J",
      "--no-playlist",
      "--no-warnings",
      ...YOUTUBE_STREAM_FORMAT_ARGS,
      `https://www.youtube.com/watch?v=${videoID}`
    ]);
    try {
      return JSON.parse(output);
    } catch {
      throw new Error("yt-dlp returned video data that could not be read.");
    }
  })();
  youtubeInfoCache.set(videoID, {at: now, info});
  // A failed run is not kept, so the next try runs yt-dlp again.
  info.catch(() => {
    if (youtubeInfoCache.get(videoID)?.info === info) youtubeInfoCache.delete(videoID);
  });
  return info;
};

type DownloadedSubtitle = {filePath: string; language: string};
const subtitleDownloads = new Map<string, Promise<DownloadedSubtitle>>();
const subtitleFiles = new Map<string, {at: number; subtitle: DownloadedSubtitle}>();
const MAX_CACHED_SUBTITLE_FILES = 32;

const downloadSubtitle = (videoID: string, lang: string): Promise<DownloadedSubtitle> => {
  const key = `${videoID}:${lang}`;
  const active = subtitleDownloads.get(key);
  if (active) return active;

  const download = (async () => {
    const now = Date.now();
    for (const [cachedKey, entry] of subtitleFiles) {
      if (now - entry.at >= INFO_LIFETIME_MS) subtitleFiles.delete(cachedKey);
    }
    const cached = subtitleFiles.get(key);
    if (cached) {
      try {
        await fs.access(cached.subtitle.filePath);
        return cached.subtitle;
      } catch {
        subtitleFiles.delete(key);
      }
    }

    const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru_youtube_"));
    const outputBase = path.join(tempDirPath, `${videoID}_${lang}`);
    try {
      let filePath: string | undefined;
      try {
        // The title lookup and language picker already extracted these signed URLs. A new yt-dlp
        // run per selected track repeats all player/manifest requests, especially costly on long videos.
        const caption = await downloadYoutubeCaption(await youtubeInfo(videoID), lang);
        if (caption) {
          const captionPath = `${outputBase}.${caption.ext}`;
          await fs.writeFile(captionPath, caption.content, "utf8");
          filePath = captionPath;
        }
      } catch (error) {
        // Expired URLs or a caption-only HLS playlist still work through yt-dlp's downloader.
        console.warn(`[IPC] Retrying YouTube captions with yt-dlp for ${videoID} (${lang}):`, error.message);
      }

      if (!filePath) {
        const ytDlpPath = await requireMediaTool("yt-dlp");
        await runYtDlp(ytDlpPath, [
          "--write-subs", "--write-auto-subs",
          "--sub-langs", lang, "--sub-format", "vtt/srt",
          "--skip-download", "--no-playlist", "--no-warnings",
          "--socket-timeout", "15", "--retries", "1",
          "--output", outputBase, `https://youtube.com/watch?v=${videoID}`
        ]);
        const files = await fs.readdir(tempDirPath);
        const downloadedFile = files.find((file) => file.endsWith(".vtt")) ?? files.find((file) => file.endsWith(".srt"));
        if (!downloadedFile) throw new Error(`Could not find downloaded subtitle file for ${videoID} (${lang})`);
        filePath = path.join(tempDirPath, downloadedFile);
      }

      const subtitle = {filePath, language: lang};
      subtitleFiles.set(key, {at: Date.now(), subtitle});
      if (subtitleFiles.size > MAX_CACHED_SUBTITLE_FILES) subtitleFiles.delete(subtitleFiles.keys().next().value);
      return subtitle;
    } catch (error) {
      await fs.rm(tempDirPath, {recursive: true, force: true}).catch(() => undefined);
      throw error;
    }
  })();
  subtitleDownloads.set(key, download);
  download.finally(() => subtitleDownloads.delete(key)).catch(() => undefined);
  return download;
};

export function registerYoutubeHandlers() {
  // Where mpv plays a YouTube video from (main/helpers/youtubeStream.ts); {ok: false} sends the page
  // to the YouTube embed instead.
  ipcMain.handle("resolveYoutubeStream", async (_event, videoID) => {
    try {
      if (!YOUTUBE_VIDEO_ID.test(String(videoID))) throw new Error(`Invalid YouTube video id: ${videoID}`);
      return {ok: true, ...youtubeStreamSource(await youtubeInfo(String(videoID)))};
    } catch (error) {
      console.warn(`[IPC] resolveYoutubeStream: ${videoID} plays in the YouTube embed:`, error.message);
      return {ok: false, error: error.message};
    }
  });

  ipcMain.handle("getYoutubeSubtitleLanguages", async (event, videoID) => {
    console.log(`[IPC] getYoutubeSubtitleLanguages called for ${videoID}`);
    try {
      if (!YOUTUBE_VIDEO_ID.test(String(videoID))) throw new Error(`Invalid YouTube video id: ${videoID}`);
      const info = await youtubeInfo(String(videoID));
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
      return {success: true, ...await downloadSubtitle(String(videoID), String(lang))};
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
      const language = String(lang ?? "ja");
      if (!YOUTUBE_VIDEO_ID.test(String(videoID)) || !SUBTITLE_LANGUAGE.test(language)) {
        throw new Error("Invalid YouTube video id or subtitle language.");
      }
      const info = await youtubeInfo(String(videoID));
      const availableLanguages = [...new Set([...Object.keys(info.subtitles ?? {}), ...Object.keys(info.automatic_captions ?? {})])]
        .filter((code) => code !== "live_chat");
      const bestMatch = findBestLanguageMatch(language, availableLanguages);
      if (!bestMatch) return [];
      const {filePath} = await downloadSubtitle(String(videoID), bestMatch);
      return parseSubtitleCues(await fs.readFile(filePath, "utf8"))
        .map((cue) => ({
          start: (cue.from / 1000).toFixed(3),
          dur: ((cue.to - cue.from) / 1000).toFixed(3),
          text: cue.text.replace(/<[^>]*>/g, "").trim()
        }))
        .filter((cue) => cue.text);
    } catch (error) {
      console.error("Error fetching subtitles:", error);
      return [];
    }
  });

  // From the yt-dlp run the player and the subtitle list share, so naming the video costs no extra run.
  ipcMain.handle("getYoutubeVideoTitle", async (_event, videoID: string) => {
    try {
      if (!YOUTUBE_VIDEO_ID.test(String(videoID))) return null;
      const {title} = await youtubeInfo(String(videoID));
      return typeof title === "string" && title ? title : null;
    } catch (error) {
      console.error(`[IPC] Error getting YouTube title for ${videoID}:`, error);
      return null;
    }
  });
}
