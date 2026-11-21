import {parseYoutubeVideoId, YOUTUBE_ID_PATTERN} from "../../renderer/utils/utils";
import type {LastVideo} from "../../renderer/utils/continueWatching";
import {limiter} from "../helpers/limiter";
import {parseSubtitleCues} from "../helpers/subtitleParser";
import {type CaptionTrack, chooseCaptions, describeTracks} from "./captionChoice";
import {errorMessage, ToolError} from "./protocol";
import {computeCoverage, readingDiffers, wordKey} from "./videoCoverage";
import {parseYoutubeSearch, type SearchDuration, youtubeSearchUrl} from "./youtubeSearch";
import {createLanguageTools, type LanguageToolDeps} from "./languageTools";
import {isToolLanguage, toolLanguageInfo, type ToolLanguage} from "../language/languages";
import {languageModes} from "../../renderer/languages/manifest";

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
  /** The language tools' engines (main/mcp/languageDeps.ts); without them those tools answer 503. */
  language?: LanguageToolDeps;
  /** The learner's tone display setting (store `toneType`): analyze_text's basic readings follow it. */
  toneType?(): Promise<string>;
  /** Which languages' data is on this computer, and which are loaded now, for get_status. */
  languages?(): Promise<Record<string, {installed: boolean; loaded: boolean}>>;
  /** Where the tools run: "app" inside Miteiru, "headless" in the stdio server (main/headless). */
  server?: "app" | "headless";
}

/**
 * The tools by name. Each takes arguments already checked against its definition: the MCP and REST
 * routes (main/mcp/protocol.ts, analyzerServer.ts) check them, and fill in the defaults, before a call.
 */
export type MiteiruTools = Record<string, (args: Record<string, unknown>) => Promise<object>>;

const NO_LANGUAGE = "No language is chosen in Miteiru yet. Pick one on Miteiru's Home screen, then try again.";
const NO_LANGUAGE_TOOLS = "Miteiru's language tools are not available here.";

/** Where the language tools' facts come from, with their licences: what an app showing them credits. */
export const DATA_SOURCES = [
  {name: "JMdict", use: "Japanese words, readings and glosses", license: "CC BY-SA 4.0", url: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project", credit: "Electronic Dictionary Research and Development Group"},
  {name: "KANJIDIC2", use: "Kanji readings, meanings and levels", license: "CC BY-SA 4.0", url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project", credit: "Electronic Dictionary Research and Development Group"},
  {name: "KanjiVG", use: "Kanji stroke order", license: "CC BY-SA 3.0", url: "https://kanjivg.tagaini.net/", credit: "Ulrich Apel"},
  {name: "Kanjium", use: "Japanese pitch accents", license: "CC BY-SA 4.0", url: "https://github.com/mifunetoshiro/kanjium"},
  {name: "JLPT word lists", use: "Japanese JLPT levels (unofficial)", license: "CC BY-SA 4.0 (the lists themselves: CC BY)", url: "https://github.com/stephenmk/yomitan-jlpt-vocab", credit: "stephenmk; Jonathan Waller"},
  {name: "wordfreq", use: "Japanese word frequencies (freq_rank, freq_zipf; words at Zipf 3 or more)", license: "CC BY-SA 4.0 (data)", url: "https://github.com/rspeer/wordfreq", credit: "Robyn Speer"},
  {name: "IPADIC", use: "Japanese tokenizer dictionary", license: "IPADIC licence", url: "https://github.com/taku910/mecab/tree/master/mecab-ipadic"},
  {name: "WanaKana", use: "Japanese kana and romaji conversion (in-house port of wanakana 5.3.1)", license: "MIT", url: "https://github.com/WaniKani/WanaKana", credit: "WaniKani Community Github"},
  {name: "CC-CEDICT", use: "Mandarin words, pinyin and glosses", license: "CC BY-SA 4.0", url: "https://www.mdbg.net/chinese/dictionary?page=cedict"},
  {name: "CantoDict", use: "Cantonese words, jyutping and glosses", license: "see its site", url: "https://www.cantonese.sheik.co.uk/"},
  {name: "Make Me a Hanzi", use: "Hanzi stroke order and decomposition", license: "Arphic Public License and LGPL", url: "https://github.com/skishore/makemeahanzi"},
  {name: "complete-hsk-vocabulary", use: "Mandarin HSK 3.0 levels", license: "MIT", url: "https://github.com/drkameleon/complete-hsk-vocabulary"},
  {name: "pinyin-pro", use: "Mandarin pinyin", license: "MIT", url: "https://github.com/zh-lx/pinyin-pro"},
  {name: "OpenCC (in-house Rust port of opencc-js 1.4.1)", use: "Simplified, traditional, Hong Kong and Taiwan subtitle forms", license: "MIT and Apache-2.0", url: "https://github.com/nk2028/opencc-js"},
  {name: "to-jyutping", use: "Cantonese jyutping (in-house Rust port of to-jyutping 3.1.1)", license: "BSD-2-Clause", url: "https://github.com/CanCLID/to-jyutping"},
  {name: "VNEDict", use: "Vietnamese glosses", license: "see its site", url: "https://www.denisowski.org/Vietnamese/Vietnamese.html"}
];

/** A named language as the video tools describe one (the manifest's mode for it). */
const learningLanguageFor = (id: ToolLanguage): LearningLanguage => {
  const info = toolLanguageInfo(id);
  const mode = languageModes.find((candidate) => candidate.pluginId === info.pluginId);
  return {code: info.code, name: mode?.englishName ?? info.name, tokenizerMode: info.tokenizerMode, pluginId: info.pluginId};
};
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
  const languageTools = deps.language ? createLanguageTools(deps.language) : null;
  const requireLanguageTools = () => {
    if (!languageTools) throw new ToolError(NO_LANGUAGE_TOOLS, 503);
    return languageTools;
  };
  /** A language named in the call (its engine loaded), else null to use the learner's. */
  const namedLanguage = async (requested: unknown): Promise<LearningLanguage | null> => {
    if (requested === undefined || requested === null) return null;
    if (!isToolLanguage(requested)) throw new ToolError("language must be one of: ja, zh-Hans, zh-Hant, yue, vi");
    await requireLanguageTools().languageOf(requested);
    return learningLanguageFor(requested);
  };
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
    const [saved, last, ytDlp, languages] = await Promise.all([
      language ? deps.savedWords(language.code) : null,
      deps.lastVideo(),
      deps.ytDlpAvailable().catch(() => false),
      deps.languages?.().catch(() => undefined)
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
      youtube: {ytDlp},
      ...(languages ? {languages} : {}),
      ...(deps.server ? {server: deps.server} : {}),
      ...(deps.language ? {sources: DATA_SOURCES} : {})
    };
  };

  const search_videos = async (args: Record<string, unknown>) => {
    const query = String(args.query).trim();
    const captions = args.captions as "learning-language" | "uploader" | "any";
    const duration = args.duration as SearchDuration;
    const limit = args.limit as number;
    if (!query) throw new ToolError("query must not be empty");

    const language = await namedLanguage(args.language) ?? await learningLanguage();
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
    // A named language is read with its own engine; the learner's with the one the subtitles use.
    const named = isToolLanguage(args.language) ? args.language : null;
    const language = await namedLanguage(args.language) ?? await ensureLanguageLoaded();
    const analyze = named ? (text: string) => requireLanguageTools().analyzeRaw(named, text) : deps.analyze;
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
      tokens.push(...await Promise.all(batch.map((line) => analyze(line.text))));
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
    // A language, several texts or full detail: the language tools. Otherwise the shape it always had.
    if (args.language !== undefined || args.texts !== undefined || args.detail === "full") {
      return requireLanguageTools().analyze(args, await deps.toneType?.() ?? "num");
    }
    if (typeof args.text !== "string") throw new ToolError("Missing argument: text");
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
    const language = await namedLanguage(args.language) ?? await learningLanguage();
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

  const languageTool = (name: "lookup_word" | "lookup_character" | "readings" | "text_coverage" | "known_words" | "set_word_levels" | "conjugate" | "romanize") => (
    (args: Record<string, unknown>) => requireLanguageTools()[name](args)
  );

  return {
    get_status, search_videos, rate_video, open_video, analyze_text, list_saved_words,
    lookup_word: languageTool("lookup_word"),
    lookup_character: languageTool("lookup_character"),
    readings: languageTool("readings"),
    text_coverage: languageTool("text_coverage"),
    known_words: languageTool("known_words"),
    set_word_levels: languageTool("set_word_levels"),
    conjugate: languageTool("conjugate"),
    romanize: languageTool("romanize")
  };
};
