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

const readErrorBody = async (response: Response) => {
  try {
    const text = await response.text();
    return text.slice(0, 800);
  } catch {
    return "";
  }
};

const abortSignal = (signal?: AbortSignal, timeoutMs?: number) => {
  const signals: AbortSignal[] = [];
  if (signal) {
    signals.push(signal);
  }
  if (timeoutMs && timeoutMs > 0) {
    signals.push(AbortSignal.timeout(timeoutMs));
  }
  if (signals.length === 0) {
    return undefined;
  }
  if (signals.length === 1) {
    return signals[0];
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const item of signals) {
    if (item.aborted) {
      controller.abort();
      break;
    }
    item.addEventListener("abort", onAbort, {once: true});
  }
  return controller.signal;
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
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenRouter request timed out");
    }
    throw error;
  }

  if (!response.ok) {
    const details = await readErrorBody(response);
    throw new Error(`OpenRouter ${response.status}: ${details || response.statusText}`);
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
      if (error instanceof JobCancelledError) {
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
