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

/**
 * Whether models think before answering ('openrouter.thinking' in the store). The Study page's AI
 * tools and generated-subtitle translation both read it. Thinking shows nothing while it runs and
 * is billed as output, and these tasks rarely need it, so it is off unless the learner turns it on.
 */
export const OPENROUTER_THINKING_KEY = "openrouter.thinking";
export type OpenRouterThinking = "off" | "model";
export const DEFAULT_OPENROUTER_THINKING: OpenRouterThinking = "off";

/**
 * The request's `reasoning` for a thinking setting (https://openrouter.ai/docs/use-cases/reasoning-tokens):
 * none, unless the learner leaves it to the model. Models without reasoning ignore it.
 */
export const reasoningForThinking = (thinking: unknown): { effort: "none"; exclude: true } | undefined =>
  thinking === "model" ? undefined : {effort: "none", exclude: true};

/**
 * Some models can't answer without thinking, and OpenRouter refuses such a request with a 400
 * ("Reasoning is mandatory for this endpoint and cannot be disabled"). The caller then asks again,
 * leaving reasoning to the model.
 */
export const refusesAnswerWithoutThinking = (status: number | undefined, message: string): boolean =>
  status === 400 && /reason|thinking|effort/i.test(message);

// Video settings (AI tab) and the Study page's settings both have the fields, and X opens either.
export const openRouterMessages = {
  missingApiKey: "Add your OpenRouter key first: press X for settings and paste it under OpenRouter AI (the AI tab while watching).",
  missingModel: "Choose and save an AI model first: press X for settings and save one under OpenRouter AI (the AI tab while watching).",
};
