import {
  OPENROUTER_CHAT_URL,
  OPENROUTER_REQUEST_HEADERS,
  OPENROUTER_TRANSCRIBE_URL
} from "../../renderer/utils/openRouterConstants";
import {JobCancelledError, throwIfAborted} from "./runCommand";

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** An OpenRouter error response; 4xx other than 408/429 will not succeed on retry. */
export class OpenRouterHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OpenRouterHttpError";
  }

  get retryable() {
    return this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

const readErrorBody = async (response: Response) => {
  try {
    const text = await response.text();
    return text.slice(0, 800);
  } catch {
    return "";
  }
};

// The job's signal and the request timeout together. AbortSignal.any drops its listeners on the job
// signal when the request ends, which a hand-made controller per request did not.
const abortSignal = (signal?: AbortSignal, timeoutMs?: number) => {
  const signals = [signal, timeoutMs && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined].filter(Boolean);
  if (signals.length === 0) {
    return undefined;
  }
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
};

const requestJson = async (
  url: string,
  apiKey: string,
  body: unknown,
  options: {signal?: AbortSignal; timeoutMs?: number} = {}
) => {
  throwIfAborted(options.signal);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...OPENROUTER_REQUEST_HEADERS,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: abortSignal(options.signal, options.timeoutMs)
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw new JobCancelledError();
    }
    // AbortSignal.timeout rejects with TimeoutError; a combined signal with AbortError.
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("OpenRouter request timed out");
    }
    throw error;
  }

  if (!response.ok) {
    const details = await readErrorBody(response);
    throw new OpenRouterHttpError(`OpenRouter ${response.status}: ${details || response.statusText}`, response.status);
  }
  return response.json();
};

export async function transcribeOpenRouterAudio(options: {
  apiKey: string;
  model: string;
  audioBase64: string;
  format: string;
  language?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const payload: Record<string, unknown> = {
    model: options.model,
    input_audio: {
      data: options.audioBase64,
      format: options.format
    },
    response_format: "verbose_json",
    timestamp_granularities: ["segment"]
  };
  if (options.language) {
    payload.language = options.language;
  }
  return requestJson(OPENROUTER_TRANSCRIBE_URL, options.apiKey, payload, {
    signal: options.signal,
    timeoutMs: options.timeoutMs
  });
}

export async function openRouterChatCompletion(options: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{content: string; usage?: Record<string, unknown>}> {
  const data = await requestJson(OPENROUTER_CHAT_URL, options.apiKey, {
    model: options.model,
    temperature: options.temperature ?? 0.2,
    messages: options.messages
  }, {
    signal: options.signal,
    timeoutMs: options.timeoutMs
  });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned an empty chat response");
  }
  return {content, usage: data?.usage};
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  options: {attempts?: number; delayMs?: number; signal?: AbortSignal} = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 1200;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    throwIfAborted(options.signal);
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // A cancelled job, or a request OpenRouter rejects (bad key, model or body), fails at once.
      if (error instanceof JobCancelledError || (error instanceof OpenRouterHttpError && !error.retryable)) {
        throw error;
      }
      if (attempt === attempts - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
