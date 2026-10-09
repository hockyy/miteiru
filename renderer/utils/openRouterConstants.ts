/**
 * Shared OpenRouter endpoints and headers.
 * Used by renderer chat/streaming and main-process ASR/translate.
 */
export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_URL = `${OPENROUTER_API_BASE}/chat/completions`;
export const OPENROUTER_TRANSCRIBE_URL = `${OPENROUTER_API_BASE}/audio/transcriptions`;

export const OPENROUTER_REQUEST_HEADERS = {
  "HTTP-Referer": "https://github.com/hockyy/miteiru",
  "X-Title": "Miteiru",
};

export const openRouterMessages = {
  missingApiKey: "Please set your OpenRouter API key in settings (Ctrl+X).",
  missingModel: "Please set and save your AI model in settings (Ctrl+X).",
};
