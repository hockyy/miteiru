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

export const openRouterMessages = {
  missingApiKey: "Add your OpenRouter key first: open Study a text from Home, press X (or click Settings), and paste it in.",
  missingModel: "Choose and save an AI model first: open Study a text from Home and press X (or click Settings).",
};
