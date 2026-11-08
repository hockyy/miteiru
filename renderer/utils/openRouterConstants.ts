import {MITEIRU_REPO_URL} from "./constants";

/**
 * Shared OpenRouter endpoints and headers.
 * Used by renderer chat/streaming and main-process ASR/translate.
 */
export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_URL = `${OPENROUTER_API_BASE}/chat/completions`;
export const OPENROUTER_TRANSCRIBE_URL = `${OPENROUTER_API_BASE}/audio/transcriptions`;

export const OPENROUTER_REQUEST_HEADERS = {
  "HTTP-Referer": MITEIRU_REPO_URL,
  "X-Title": "Miteiru",
};

/** The model the AI tools use until the learner saves another ('openrouter.model' in the store). */
export const DEFAULT_OPENROUTER_MODEL = "z-ai/glm-5.2:nitro";

/** Where to get a key; shown beside the key field. */
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

// Video settings (AI tab) and the Study page's settings both have the fields, and X opens either.
export const openRouterMessages = {
  missingApiKey: "Add your OpenRouter key first: press X for settings and paste it under OpenRouter AI (the AI tab while watching).",
  missingModel: "Choose and save an AI model first: press X for settings and save one under OpenRouter AI (the AI tab while watching).",
};
