/**
 * Fonts: what ships with Miteiru, what to recommend, and how a choice becomes a CSS font stack.
 *
 * Bundled (OFL, from @fontsource-variable, imported in pages/_app.tsx): Noto Sans JP, SC and TC (all
 * weights) and Nunito. The same character is drawn differently in Japanese and in simplified or
 * traditional Chinese, so the default stack puts the learning language's Noto first; globals.css
 * picks the order from `data-learning-lang` on the root element.
 */

// The Noto Sans for the language being learned, then the other two (globals.css).
export const CJK_FONT_STACK = "var(--miteiru-cjk-font)";
/** Default subtitle font: the learning language's Noto Sans. */
export const DEFAULT_SUBTITLE_FONT = "var(--miteiru-subtitle-font)";
/** Default interface font: Nunito, with Noto Sans for Japanese and Chinese text. */
export const DEFAULT_APP_FONT = "var(--miteiru-ui-font)";

export interface FontOption {
  /** CSS font-family value stored in the settings. */
  value: string;
  label: string;
  note: string;
  /** Font family that must be installed for the option to be offered; none for bundled fonts. */
  requires?: string;
}

/** A stack for one named font, falling back to the bundled fonts for anything it lacks. */
export const fontStackFor = (family: string) =>
  `"${family.replace(/["\\]/g, "")}", ${CJK_FONT_STACK}, sans-serif`;

const bundled = (family: string, label: string, note: string): FontOption => ({
  value: fontStackFor(family), label, note
});

const installed = (family: string, label: string, note: string): FontOption => ({
  value: fontStackFor(family), label, note, requires: family
});

export const SUBTITLE_FONT_OPTIONS: FontOption[] = [
  {value: DEFAULT_SUBTITLE_FONT, label: "Noto Sans · matches the language", note: "Built in · Japanese, simplified and traditional Chinese, Vietnamese"},
  bundled("Noto Sans JP Variable", "Noto Sans JP", "Built in · Japanese"),
  bundled("Noto Sans SC Variable", "Noto Sans SC", "Built in · simplified Chinese"),
  bundled("Noto Sans TC Variable", "Noto Sans TC", "Built in · traditional Chinese, Cantonese"),
  bundled("Nunito Variable", "Nunito", "Built in · rounded Latin and Vietnamese"),
  installed("UD Digi Kyokasho N", "UD Digi Kyokasho", "Japanese textbook style: kana and kanji as taught in school"),
  installed("BIZ UDPGothic", "BIZ UDPGothic", "Japanese, designed for legibility"),
  installed("BIZ UDPMincho", "BIZ UDPMincho", "Japanese serif (mincho)"),
  installed("Hiragino Sans", "Hiragino Sans", "Japanese (macOS)"),
  installed("Yu Gothic", "Yu Gothic", "Japanese"),
  installed("Meiryo", "Meiryo", "Japanese"),
  installed("KaiTi", "KaiTi 楷体", "Chinese brush (kai) style, close to handwriting"),
  installed("Microsoft YaHei", "Microsoft YaHei", "Simplified Chinese"),
  installed("Microsoft JhengHei", "Microsoft JhengHei", "Traditional Chinese"),
  installed("PingFang SC", "PingFang SC", "Simplified Chinese (macOS)"),
  installed("PingFang TC", "PingFang TC", "Traditional Chinese (macOS)"),
];

export const APP_FONT_OPTIONS: FontOption[] = [
  {value: DEFAULT_APP_FONT, label: "Nunito + Noto Sans", note: "Built in · rounded and friendly; the default"},
  bundled("Noto Sans JP Variable", "Noto Sans", "Built in · plain and even"),
  {value: "system-ui, sans-serif", label: "System font", note: "Segoe UI on Windows, SF Pro on macOS"},
  installed("BIZ UDPGothic", "BIZ UDPGothic", "Designed for legibility"),
];

/** The family a stack starts with, without quotes: `"Yu Gothic", …` → `Yu Gothic`. */
export const firstFontFamily = (value: string) =>
  (value.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");

/** How a stored font value reads in the picker: its option's label, or its first family. */
export const fontLabel = (value: string, options: FontOption[]) =>
  options.find((option) => option.value === value)?.label ?? firstFontFamily(value);

// The default subtitle fonts before the bundled ones; stored styles still holding them move to the
// new default (they rendered Japanese and Chinese in whatever fallback the system picked).
const LEGACY_DEFAULT_FONTS = new Set(["Arial", "Arial, Hiragino Sans, Meiryo, sans-serif", "Arial, sans-serif"]);

/** A stored subtitle style with the old default font replaced by the bundled default. */
export const withCurrentDefaultFont = <T extends { text?: { fontFamily?: string } }>(styling: T): T => {
  if (!styling?.text || !LEGACY_DEFAULT_FONTS.has(styling.text.fontFamily ?? "")) return styling;
  return {...styling, text: {...styling.text, fontFamily: DEFAULT_SUBTITLE_FONT}};
};

/** Marks the language being learned on the root element, which orders the default CJK fonts. */
export const setLearningLanguage = (lang: string) => {
  if (lang) document.documentElement.dataset.learningLang = lang;
};

export interface FontItem {
  key: string;
  value: string;
  label: string;
  note?: string;
}

// Installed fonts listed below the recommendations, at most this many for a query.
const MAX_INSTALLED_SHOWN = 60;

/**
 * The picker's entries for `query`: recommendations (installed ones only, once the installed fonts
 * are known), then other installed fonts, then the typed name itself unless it names one of those.
 */
export const buildFontItems = (options: FontOption[], installed: string[], query: string) => {
  const needle = query.trim().toLowerCase();
  const matches = (text = "") => !needle || text.toLowerCase().includes(needle);
  const installedSet = new Set(installed);
  const recommended: FontItem[] = options
    .filter((option) => !option.requires || installed.length === 0 || installedSet.has(option.requires))
    .filter((option) => matches(option.label) || matches(option.note))
    .map((option) => ({key: `r:${option.value}`, value: option.value, label: option.label, note: option.note}));
  const recommendedFamilies = new Set(options.map((option) => option.requires).filter(Boolean));
  const others: FontItem[] = installed
    .filter((family) => !recommendedFamilies.has(family) && matches(family))
    .slice(0, MAX_INSTALLED_SHOWN)
    .map((family) => ({key: `i:${family}`, value: fontStackFor(family), label: family}));
  const typed = query.trim();
  const named = installedSet.has(typed) || options.some((option) => option.label === typed || option.requires === typed);
  const custom: FontItem[] = typed && !named
    ? [{key: "custom", value: fontStackFor(typed), label: typed, note: "Use this font name"}]
    : [];
  return {recommended, others, custom, all: [...recommended, ...others, ...custom]};
};

let installedFonts: Promise<string[]> | null = null;

/** Families of the fonts installed on this computer, sorted; empty where the browser can't tell. */
export const listInstalledFonts = (): Promise<string[]> => {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
  if (!query) return Promise.resolve([]);
  installedFonts ??= query()
    .then((fonts) => [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b)))
    .catch(() => {
      installedFonts = null;
      return [];
    });
  return installedFonts;
};
