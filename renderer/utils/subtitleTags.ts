/**
 * Subtitle files that sit next to a video and say their language in their name: `show.ja.srt`,
 * `show.eng.ass`, `show.zh-Hans.srt`. Pure, so the folder scan (main/) and the loader (renderer/)
 * agree and tests can cover it.
 */

export type SubtitleSlot = "primary" | "secondary";

export type RoutedSubtitle = {
  path: string;
  /** Undefined: the file names no language, so the learner is asked where it goes. */
  target?: SubtitleSlot;
};

// Tags that mean the language being learned, best first. Compared in lower case with "_" as "-".
// "zh-hk" belongs to Cantonese, not Mandarin, and a bare "zh" is the plain Chinese of Mandarin.
const LEARNING_TAGS: Record<string, string[]> = {
  ja: ["ja", "jpn", "jp", "japanese"],
  "zh-cn": ["zh-hans", "zh-cn", "chs", "zh", "zho", "chi", "chinese", "zh-hant", "zh-tw", "cht"],
  yue: ["yue", "zh-hk", "cantonese"],
  vi: ["vi", "vie", "vietnamese"]
};

const ENGLISH_TAGS = ["en", "eng", "english", "en-us", "en-gb"];

const normalizeTag = (tag: string) => tag.toLowerCase().replace(/_/g, "-");

const fileNameOf = (filePath: string) => filePath.split(/[\\/]/).pop() ?? filePath;

const dropExtension = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
};

/**
 * The tag in a subtitle's name next to a video: "ja" for `show.ja.srt` beside `show.mkv`, "" for
 * `show.srt`, and null when the file is not named after the video (or has several dots after it,
 * like `show.ja.forced.srt`, which is not a plain language tag).
 */
export const subtitleTagBesideVideo = (videoPath: string, subtitlePath: string): string | null => {
  const base = dropExtension(fileNameOf(videoPath)).toLowerCase();
  const subtitleName = fileNameOf(subtitlePath);
  const subtitleBase = dropExtension(subtitleName).toLowerCase();
  if (subtitleBase === base) return "";
  if (!subtitleBase.startsWith(`${base}.`)) return null;
  const tag = subtitleName.slice(base.length + 1, subtitleName.lastIndexOf("."));
  return tag.includes(".") || tag === "" ? null : tag;
};

/** How well a tag suits the language being learned: 0 is best, -1 means it does not. */
const learningRank = (tag: string, appLang: string): number => {
  const key = normalizeTag(appLang);
  const tags = LEARNING_TAGS[key] ?? (key === "en" ? ENGLISH_TAGS : [key.split("-")[0]]);
  return tags.indexOf(normalizeTag(tag));
};

export type SubtitleTagKind = "learning" | "translation" | "other";

/** Which side a tag goes to: the language being learned, English as the translation, or neither. */
export const classifySubtitleTag = (tag: string, appLang: string): SubtitleTagKind => {
  if (learningRank(tag, appLang) >= 0) return "learning";
  return ENGLISH_TAGS.includes(normalizeTag(tag)) ? "translation" : "other";
};

/**
 * Which of a video's neighbouring subtitle files to load, and into which slot.
 * - A file tagged with the learning language is the main subtitle; the exact tag (`ja`) beats looser
 *   ones (`jpn`), and a tagged file beats an untagged one.
 * - English goes to the translation.
 * - A file with no tag (`show.srt`) is kept only when no tagged main subtitle exists, and the learner
 *   is asked where it goes, as before.
 * - Files tagged with any other language are left out.
 */
export const routeSubtitlesBesideVideo = (
  videoPath: string,
  candidates: string[],
  appLang: string
): RoutedSubtitle[] => {
  let main: { path: string; rank: number } | undefined;
  let translation: string | undefined;
  let untagged: string | undefined;
  for (const path of candidates) {
    const tag = subtitleTagBesideVideo(videoPath, path);
    if (tag === null) continue;
    if (tag === "") {
      untagged ??= path;
      continue;
    }
    const kind = classifySubtitleTag(tag, appLang);
    if (kind === "learning") {
      const rank = learningRank(tag, appLang);
      if (!main || rank < main.rank) main = {path, rank};
    } else if (kind === "translation") {
      translation ??= path;
    }
  }
  const routed: RoutedSubtitle[] = [];
  if (main) routed.push({path: main.path, target: "primary"});
  if (translation) routed.push({path: translation, target: "secondary"});
  if (!main && untagged) routed.push({path: untagged});
  return routed;
};
