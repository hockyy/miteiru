/**
 * ASR / subtitle-generation settings shared by the modal and main process.
 * Default is Qwen3-ASR 1.7B: current SOTA for timestamped Cantonese SRT.
 * Flash models are omitted because they reject verbose_json (no cue times).
 */
export const DEFAULT_ASR_MODEL = "qwen/qwen3-asr-1.7b";
export const DEFAULT_TRANSLATE_MODEL = "qwen/qwen3-32b";

export const ASR_CHUNK_SECONDS = 90;
export const ASR_CONCURRENCY = 2;
export const TRANSLATE_BATCH_SIZE = 28;
export const ASR_REQUEST_TIMEOUT_MS = 180_000;
export const TRANSLATE_REQUEST_TIMEOUT_MS = 180_000;

export type AsrModelOption = {
  id: string;
  label: string;
};

export const ASR_MODELS: AsrModelOption[] = [
  {id: "qwen/qwen3-asr-1.7b", label: "Qwen3-ASR 1.7B (SOTA, timestamps)"},
  {id: "qwen/qwen3-asr-0.6b", label: "Qwen3-ASR 0.6B (faster)"},
  {id: "openai/whisper-large-v3", label: "Whisper Large v3"},
  {id: "openai/whisper-large-v3-turbo", label: "Whisper Large v3 Turbo"},
];

export const TRANSLATE_MODELS: AsrModelOption[] = [
  {id: "qwen/qwen3-32b", label: "Qwen3 32B (subtitle default)"},
  {id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash"},
  {id: "z-ai/glm-5.2:nitro", label: "GLM 5.2 Nitro"},
];

export function asrLanguageForAppLang(lang: string): string {
  switch (lang) {
    case "yue":
      return "yue";
    case "ja":
      return "ja";
    case "zh-CN":
      return "zh";
    case "vi":
      return "vi";
    default:
      return lang || "yue";
  }
}

export function subtitleFileTagForAppLang(lang: string): string {
  switch (lang) {
    case "yue":
      return "yue";
    case "ja":
      return "ja";
    case "zh-CN":
      return "zh";
    case "vi":
      return "vi";
    default:
      return lang || "src";
  }
}

export function shouldConvertToTraditional(lang: string): boolean {
  return lang === "yue";
}

export function maxCueCharsForAppLang(lang: string): number {
  return lang === "ja" || lang === "vi" ? 42 : 22;
}

export function isKnownAsrModel(model: string): boolean {
  return ASR_MODELS.some((option) => option.id === model);
}
