import {parseYoutubeVideoId, YOUTUBE_ID_PATTERN} from "../../renderer/utils/utils";
import type {LastVideo} from "../../renderer/utils/continueWatching";
import {limiter} from "../helpers/limiter";
import {parseSubtitleCues} from "../helpers/subtitleParser";
import {type CaptionTrack, chooseCaptions, describeTracks} from "./captionChoice";
import {errorMessage, ToolError} from "./protocol";
import {computeCoverage, readingDiffers, wordKey} from "./videoCoverage";
import {parseYoutubeSearch, type SearchDuration, youtubeSearchUrl} from "./youtubeSearch";

export interface LearningLanguage {
  code: string;
  name: string;
  tokenizerMode: string;
  pluginId: string;
}

export interface OpenVideoRequest {
  videoId: string;
  url: string;
  title: string;
  startAt: number;
  main: string | null;
  translation: string | null;
}

export interface MiteiruToolDeps {
  version: string;
  /** The language loaded in Miteiru now. */
  loadedLanguage(): LearningLanguage | null;
  /** The language the learner last chose (store `app.lastLanguageMode`). */
  rememberedLanguage(): Promise<LearningLanguage | null>;
  /** Loads a language as Home's Watch button does; throws when it fails. */
  loadLanguage(language: LearningLanguage): Promise<void>;
  /** Splits a line into words in the loaded language. */
  analyze(text: string): Promise<any[]>;
  savedWords(languageCode: string): Promise<Record<string, {level: number; updTime: number}>>;
  /** Store `video.last`. */
  lastVideo(): Promise<LastVideo | null>;
  ytDlpAvailable(): Promise<boolean>;
  /** yt-dlp's `--flat-playlist -J` listing of a YouTube URL, at most `count` entries. */
  searchYoutube(url: string, count: number): Promise<any>;
  /** yt-dlp's description of a video, kept for a while so several tools can share one run. */
  videoInfo(videoId: string): Promise<any>;
  captionText(videoId: string, code: string): Promise<string>;
  /** Hands the request to Miteiru's window: taken, turned down by the learner, replaced by a newer one, or not taken yet. */
  openInWindow(request: OpenVideoRequest): Promise<"opened" | "declined" | "replaced" | "waiting">;
  /** The clock for the search time budget; Date.now by default. */
  now?(): number;
}

/**
 * The tools by name. Each takes arguments already checked against its definition: the MCP and REST
 * routes (main/mcp/protocol.ts, analyzerServer.ts) check them, and fill in the defaults, before a call.
 */
export type MiteiruTools = Record<string, (args: Record<string, unknown>) => Promise<object>>;

const NO_LANGUAGE = "No language is chosen in Miteiru yet. Pick one on Miteiru's Home screen, then try again.";
const SEARCH_BUDGET_MS = 45_000;
const SEARCH_CHECKS_AT_ONCE = 3;
// Each check is a full yt-dlp run against YouTube; many in a row can get the computer asked to prove
// it isn't a bot, which also stops Miteiru playing YouTube for a while.
const MAX_SEARCH_CHECKS = 15;
// yt-dlp runs the tools start at once, across every call: an assistant may call several tools together.
const YOUTUBE_RUNS_AT_ONCE = 3;
// Tokenizing a long video's captions keeps the backend busy, and the learner's own subtitles share it.
const MAX_CAPTION_LINES = 2000;
// The local API gives up on an answer after 2 minutes (src-tauri/src/analyzer.rs): a rating that waited
// longer than this for the ones ahead of it gives up first, and reading stops at the deadline.
const RATE_QUEUE_WAIT_MS = 60_000;
const RATE_DEADLINE_MS = 90_000;
const ANALYZE_LINES_AT_ONCE = 8;
const FIRST_LINES = 8;


const noLanguage = () => new ToolError(NO_LANGUAGE, 409);

const youtubeUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** "m:ss", or "h:mm:ss" from an hour on. */
const clockText = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

const durationText = (seconds: unknown) => (typeof seconds === "number" && Number.isFinite(seconds) ? clockText(seconds) : null);

/** yt-dlp prints dates as YYYYMMDD. */
const uploadedText = (uploadDate: unknown) => {
  const match = typeof uploadDate === "string" ? uploadDate.match(/^(\d{4})(\d{2})(\d{2})$/) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const dateText = (milliseconds: number) => new Date(milliseconds).toISOString().slice(0, 10);

const parseVideo = (input: string) => {
  const text = input.trim();
  const id = parseYoutubeVideoId(text) ?? (YOUTUBE_ID_PATTERN.test(text) ? text : null);
  if (!id) throw new ToolError(`Not a YouTube link or video id: ${input}`, 400);
  return id;
};

const languageSummary = ({code, name}: LearningLanguage) => ({code, name});

const levelName = (level: number | undefined) => (level === 1 ? "learning" : level === 2 ? "known" : "new");

const countLevels = (saved: Record<string, {level: number}>) => {
  let learning = 0;
  let known = 0;
  for (const {level} of Object.values(saved)) {
    if (level === 1) learning++;
    else if (level === 2) known++;
  }
  return {learning, known};
};

const hasLetterOrDigit = (text: unknown) => typeof text === "string" && /[\p{L}\p{N}]/u.test(text);

const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const createMiteiruTools = (deps: MiteiruToolDeps): MiteiruTools => {
  const now = deps.now ?? Date.now;
  let loading: Promise<LearningLanguage> | null = null;
  const youtubeRun = limiter(YOUTUBE_RUNS_AT_ONCE);
  const oneRatingAtATime = limiter(1);

  const learningLanguage = async () => deps.loadedLanguage() ?? await deps.rememberedLanguage();

  /** The loaded language; loads the remembered one when Miteiru is still on its Home screen. */
  const ensureLanguageLoaded = async (): Promise<LearningLanguage> => {
    const loaded = deps.loadedLanguage();
    if (loaded) return loaded;
    // Two tools asking at once share one load.
    loading ??= (async () => {
      const remembered = await deps.rememberedLanguage();
      if (!remembered) throw noLanguage();
      try {
        await deps.loadLanguage(remembered);
      } catch (error) {
        throw new ToolError(`Miteiru couldn't load ${remembered.name}: ${errorMessage(error)}`, 409);
      }
      // The learner may have loaded another language meanwhile; the loaded one is what the tools use.
      return deps.loadedLanguage() ?? remembered;
    })().finally(() => {
      loading = null;
    });
    return loading;
  };

  const videoInfo = async (videoId: string) => {
    try {
      return await youtubeRun(() => deps.videoInfo(videoId));
    } catch (error) {
      throw new ToolError(errorMessage(error), 502);
    }
  };

  const videoSummary = (videoId: string, info: any) => ({
    id: videoId,
    url: youtubeUrl(videoId),
    title: typeof info?.title === "string" && info.title ? info.title : videoId,
    channel: trimmed(info?.channel) || trimmed(info?.uploader) || null,
    duration: durationText(info?.duration),
    uploaded: uploadedText(info?.upload_date),
    views: typeof info?.view_count === "number" ? info.view_count : null
  });

  const get_status = async () => {
    const loadedLanguage = deps.loadedLanguage();
    const language = loadedLanguage ?? await deps.rememberedLanguage();
    const [saved, last, ytDlp] = await Promise.all([
      language ? deps.savedWords(language.code) : null,
      deps.lastVideo(),
      deps.ytDlpAvailable().catch(() => false)
    ]);
    return {
      version: deps.version,
      language: language ? {code: language.code, name: language.name, loaded: Boolean(loadedLanguage)} : null,
      savedWords: saved ? countLevels(saved) : null,
      lastVideo: last ? {
        title: last.title,
        video: last.path,
        stoppedAt: clockText(last.position),
        watched: Number.isFinite(last.savedAt) ? new Date(last.savedAt).toISOString() : null
      } : null,
      youtube: {ytDlp}
    };
  };

  const search_videos = async (args: Record<string, unknown>) => {
    const query = String(args.query).trim();
    const captions = args.captions as "learning-language" | "uploader" | "any";
    const duration = args.duration as SearchDuration;
    const limit = args.limit as number;
    if (!query) throw new ToolError("query must not be empty");

    const language = await learningLanguage();
    if (captions !== "any" && !language) throw noLanguage();

    let listing: any;
    try {
      listing = await youtubeRun(() => deps.searchYoutube(
        youtubeSearchUrl(query, {duration, uploaderCaptions: captions === "uploader"}),
        captions === "any" ? limit : Math.min(limit * 3, MAX_SEARCH_CHECKS)
      ));
    } catch (error) {
      throw new ToolError(errorMessage(error), 502);
    }
    const entries = parseYoutubeSearch(listing);
    const entryResult = (entry: (typeof entries)[number], info: any, tracks: {main: CaptionTrack; translation: CaptionTrack | null} | null) => ({
      id: entry.id,
      url: youtubeUrl(entry.id),
      title: entry.title,
      channel: entry.channel || null,
      duration: durationText(entry.durationSeconds),
      views: entry.views,
      uploaded: uploadedText(info?.upload_date),
      description: entry.description,
      captions: tracks
    });
    const result = (videos: ReturnType<typeof entryResult>[], checked: number, skipped: {noCaptions: number; failed: number}, note?: string) => ({
      language: language ? languageSummary(language) : null,
      query,
      videos,
      checked,
      skipped,
      ...(note ? {note} : {})
    });

    if (captions === "any") {
      return result(entries.slice(0, limit).map((entry) => entryResult(entry, null, null)), 0, {noCaptions: 0, failed: 0});
    }

    const videos: ReturnType<typeof entryResult>[] = [];
    const skipped = {noCaptions: 0, failed: 0};
    let checked = 0;
    let firstFailure = "";
    let budgetRanOut = false;
    const started = now();

    // Each check is one yt-dlp run, a few seconds: a few at a time, in the order YouTube ranked them.
    // One still waiting for its turn when the budget runs out never starts.
    const check = async (entry: (typeof entries)[number], abandoned: () => boolean) => {
      const info = await youtubeRun(() => {
        if (abandoned()) throw new Error("Given up before it started.");
        return deps.videoInfo(entry.id);
      });
      const chosen = chooseCaptions(describeTracks(info), language.code);
      return {info, chosen};
    };

    for (let next = 0; next < entries.length && videos.length < limit; next += SEARCH_CHECKS_AT_ONCE) {
      const remaining = SEARCH_BUDGET_MS - (now() - started);
      if (remaining <= 0) {
        budgetRanOut = true;
        break;
      }
      const batch = entries.slice(next, next + SEARCH_CHECKS_AT_ONCE);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let gaveUp = false;
      const givenUp = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => {
          gaveUp = true;
          resolve("timeout");
        }, remaining);
      });
      const outcomes = await Promise.all(batch.map((entry) => {
        const running = check(entry, () => gaveUp);
        // A check given up on may still fail later; nobody is waiting for it then.
        running.catch(() => undefined);
        return Promise.race([running, givenUp]).then(
          (outcome) => ({entry, outcome}),
          (error) => ({entry, outcome: error instanceof Error ? error : new Error(String(error))})
        );
      }));
      clearTimeout(timer);

      for (const {entry, outcome} of outcomes) {
        if (videos.length >= limit) break;
        checked++;
        if (outcome === "timeout" || outcome instanceof Error) {
          skipped.failed++;
          if (outcome === "timeout") budgetRanOut = true;
          else firstFailure ||= outcome.message;
          continue;
        }
        const {main, translation} = outcome.chosen;
        if (!main || (captions === "uploader" && main.kind !== "uploader")) {
          skipped.noCaptions++;
          continue;
        }
        videos.push(entryResult(entry, outcome.info, {main, translation}));
      }
      if (budgetRanOut) break;
    }

    const notes = [
      budgetRanOut ? "Stopped checking captions after 45 seconds; search again with a narrower query." : "",
      checked > 0 && skipped.failed === checked && firstFailure ? `Every caption check failed: ${firstFailure}` : ""
    ].filter(Boolean);
    return result(videos, checked, skipped, notes.join(" "));
  };

  /** `asked`: when the call came in, before it waited for the ratings ahead of it. */
  const rateVideo = async (args: Record<string, unknown>, asked: number) => {
    // The local API answers within 2 minutes; past that nobody reads the result, so a rating that
    // waited too long for its turn says so now, and a slow one rates what it has read by its deadline.
    if (now() - asked > RATE_QUEUE_WAIT_MS) {
      throw new ToolError("Miteiru is still rating other videos. Ask for this one again in a moment.", 503);
    }
    const videoId = parseVideo(String(args.video));
    const language = await ensureLanguageLoaded();
    const info = await videoInfo(videoId);
    const summary = videoSummary(videoId, info);
    const tracks = describeTracks(info);
    const {main, translation} = chooseCaptions(tracks, language.code);
    if (!main) {
      const available = tracks.length > 0
        ? `Its captions: ${tracks.map((track) => `${track.code} (${track.name}, ${track.kind})`).join(", ")}`
        : "It has no captions.";
      throw new ToolError(`"${summary.title}" has no captions in ${language.name}. ${available}`, 404);
    }

    let cues: ReturnType<typeof parseSubtitleCues>;
    try {
      cues = parseSubtitleCues(await youtubeRun(() => deps.captionText(videoId, main.code)));
    } catch (error) {
      throw new ToolError(errorMessage(error), 502);
    }

    // Automatic captions roll lines up, so a line often repeats the one before it.
    const lines: Array<{text: string; endMs: number}> = [];
    for (const cue of cues) {
      const text = cue.text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (text && text !== lines.at(-1)?.text) lines.push({text, endMs: cue.to});
    }

    // From the start, up to the cap, while time allows.
    const tokens: any[][] = [];
    const ratable = Math.min(lines.length, MAX_CAPTION_LINES);
    while (tokens.length < ratable && now() - asked < RATE_DEADLINE_MS) {
      const batch = lines.slice(tokens.length, Math.min(tokens.length + ANALYZE_LINES_AT_ONCE, ratable));
      tokens.push(...await Promise.all(batch.map((line) => deps.analyze(line.text))));
    }
    if (lines.length > 0 && tokens.length === 0) {
      throw new ToolError("Miteiru took too long to read this video's captions. Ask for it again in a moment.", 503);
    }

    const saved = await deps.savedWords(language.code);
    const partial = tokens.length < lines.length;
    // Speed over the part that was read: a long video read only in part would otherwise look slow.
    const coveredMs = partial ? lines[tokens.length - 1].endMs : (cues.at(-1)?.to ?? 0);
    const minutes = !partial && typeof info?.duration === "number" && info.duration > 0
      ? info.duration / 60
      : coveredMs / 60_000;
    const notes = [
      partial ? `Only the first ${tokens.length} of ${lines.length} caption lines were rated (up to ${clockText(coveredMs / 1000)}).` : "",
      language.code === "ja" ? "Particles, auxiliary verbs, prefixes (お, ご), grammatical nouns (の, こと, よう), name suffixes (さん), interjections and fillers are not counted." : "",
      "Learners rarely save every word they know, so the saved share is a lower bound."
    ].filter(Boolean);
    return {
      video: summary,
      language: languageSummary(language),
      captions: {main, translation, available: tracks},
      captionLines: {rated: tokens.length, total: lines.length},
      ...computeCoverage(tokens, saved, minutes),
      firstLines: lines.slice(0, FIRST_LINES).map((line) => line.text),
      note: notes.join(" ")
    };
  };
  const rate_video = (args: Record<string, unknown>) => {
    const asked = now();
    return oneRatingAtATime(() => rateVideo(args, asked));
  };

  const open_video = async (args: Record<string, unknown>) => {
    const videoId = parseVideo(String(args.video));
    const language = await ensureLanguageLoaded();
    const info = await videoInfo(videoId);
    const summary = videoSummary(videoId, info);
    const tracks = describeTracks(info);
    const chosen = chooseCaptions(tracks, language.code);

    const named = (code: unknown) => {
      const track = tracks.find((candidate) => candidate.code === code);
      if (!track) {
        throw new ToolError(`This video has no caption track ${code}. Its tracks: ${tracks.map((candidate) => candidate.code).join(", ") || "none"}`, 400);
      }
      return track;
    };
    const main = args.main_subtitle !== undefined ? named(args.main_subtitle) : chosen.main;
    let translation: CaptionTrack | null = args.translation === undefined ? chosen.translation
      : args.translation === "none" ? null : named(args.translation);
    // The default translation can be the track picked as the main one.
    if (translation && translation.code === main?.code) translation = null;

    const startAt = typeof args.start_at === "number" ? args.start_at : 0;
    // Started at or past its end, the video would just end. A stream has no length to check.
    if (typeof info?.duration === "number" && info.duration > 0 && startAt >= info.duration) {
      throw new ToolError(`start_at is past the end: the video is ${clockText(info.duration)} long.`, 400);
    }
    const outcome = await deps.openInWindow({
      videoId,
      url: summary.url,
      title: summary.title,
      startAt,
      main: main?.code ?? null,
      translation: translation?.code ?? null
    });

    const notes = [
      main || outcome !== "opened" ? "" : `It has no captions in ${language.name}, so it opened without a main subtitle.`,
      outcome === "declined" ? "The learner chose to stay on the page they had open, where they had typed something, so the video didn't open." : "",
      outcome === "replaced" ? "Another open_video call came before Miteiru's window took this one, so this video won't open." : "",
      outcome === "waiting" ? "Miteiru's window hasn't picked this up yet. It opens there if the window shows its video page within a minute." : ""
    ].filter(Boolean);
    return {
      opened: outcome === "opened",
      video: {id: videoId, url: summary.url, title: summary.title},
      subtitles: {main, translation},
      ...(notes.length > 0 ? {note: notes.join(" ")} : {})
    };
  };

  const analyze_text = async (args: Record<string, unknown>) => {
    const language = await ensureLanguageLoaded();
    const [tokens, saved] = await Promise.all([deps.analyze(String(args.text)), deps.savedWords(language.code)]);
    const words = tokens.filter((token) => hasLetterOrDigit(token?.origin)).map((token) => {
      const key = wordKey(token);
      const reading = trimmed(language.code === "ja" ? token.hiragana : language.code === "zh-CN" ? token.pinyin
        : language.code === "yue" ? token.jyutping : undefined);
      const meaning = language.code === "vi" ? trimmed(token.meaning) : "";
      const pos = language.code === "ja" ? trimmed(token.pos) : "";
      return {
        text: token.origin as string,
        ...(key !== token.origin ? {base: key} : {}),
        ...(reading && readingDiffers(token.origin, reading) ? {reading} : {}),
        ...(meaning ? {meaning} : {}),
        ...(pos ? {pos} : {}),
        level: levelName(Object.prototype.hasOwnProperty.call(saved, key) ? saved[key]?.level : undefined)
      };
    });
    return {language: languageSummary(language), words};
  };

  const list_saved_words = async (args: Record<string, unknown>) => {
    const language = await learningLanguage();
    if (!language) throw noLanguage();
    const saved = await deps.savedWords(language.code);
    const level = args.level as "learning" | "known" | "all";
    const wanted = level === "all" ? [1, 2] : [level === "known" ? 2 : 1];
    const words = Object.entries(saved)
      .filter(([, entry]) => wanted.includes(entry.level))
      .sort((a, b) => (b[1].updTime ?? 0) - (a[1].updTime ?? 0))
      .slice(0, args.limit as number)
      .map(([word, entry]) => ({
        word,
        level: entry.level === 2 ? "known" : "learning",
        ...(entry.updTime > 0 ? {changed: dateText(entry.updTime)} : {})
      }));
    return {language: languageSummary(language), total: countLevels(saved), words};
  };

  return {get_status, search_videos, rate_video, open_video, analyze_text, list_saved_words};
};
