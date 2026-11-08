import {
  OPENROUTER_CHAT_URL,
  OPENROUTER_REQUEST_HEADERS,
  OPENROUTER_TRANSCRIBE_URL,
  reasoningForThinking,
  refusesAnswerWithoutThinking
} from "../../renderer/utils/openRouterConstants";
import {JobCancelledError, throwIfAborted} from "./runCommand";
import {linkAbortSignals, timeoutSignal} from "./abortSignals";
import {recordOpenRouterUsage} from "./aiUsage";

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

const requestJson = async (
  url: string,
  apiKey: string,
  body: unknown,
  options: {signal?: AbortSignal; timeoutMs?: number} = {}
) => {
  throwIfAborted(options.signal);
  // The job's signal and the request timeout together, until the response is read. Disposing drops
  // the listeners on the job's signal (it serves many requests) where AbortSignal.any is missing.
  const timeout = options.timeoutMs && options.timeoutMs > 0 ? timeoutSignal(options.timeoutMs) : undefined;
  const linked = linkAbortSignals([options.signal, timeout?.signal]);
  let dispatched = false;
  let recorded = false;
  let rejectedWithoutCharge = false;
  const record = async (usage: unknown) => {
    recorded = true;
    // Usage bookkeeping cannot turn a completed paid response into a retry.
    await recordOpenRouterUsage(usage).catch((error) => console.warn("[AI usage] Could not record OpenRouter usage:", error));
  };
  try {
    let response: Response;
    try {
      throwIfAborted(options.signal);
      dispatched = true;
      response = await fetch(url, {
        method: "POST",
        headers: {
          ...OPENROUTER_REQUEST_HEADERS,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: linked.signal
      });
    } catch (error) {
      if (options.signal?.aborted) {
        throw new JobCancelledError();
      }
      // The timeout rejects with TimeoutError; a combined signal with AbortError.
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error("OpenRouter request timed out");
      }
      throw error;
    }

    if (!response.ok) {
      rejectedWithoutCharge = response.status >= 400 && response.status < 500;
      const details = await readErrorBody(response);
      throw new OpenRouterHttpError(`OpenRouter ${response.status}: ${details || response.statusText}`, response.status);
    }
    const data = await response.json();
    // OpenRouter can answer 200 with an error body; it is final unless its code says otherwise.
    const failure = data?.error;
    if (failure && typeof failure === "object") {
      const message = typeof failure.message === "string" ? failure.message : JSON.stringify(failure).slice(0, 300);
      const code = Number(failure.code);
      const status = Number.isInteger(code) && code > 0 ? code : 502;
      rejectedWithoutCharge = status >= 400 && status < 500;
      throw new OpenRouterHttpError(`OpenRouter ${status}: ${message}`, status);
    }
    // Count newly completed provider requests, including ASR. Cache hits bypass this function.
    // Tracking must never turn a paid successful response into a retry when storage is unavailable.
    await record(data?.usage);
    return data;
  } catch (error) {
    // The Rust HTTP request can continue after the caller stops waiting. A dispatched request
    // without a terminal price may still be billed; preserve that uncertainty exactly once.
    if (dispatched && !recorded && !rejectedWithoutCharge) await record(undefined);
    throw error;
  } finally {
    linked.dispose();
    timeout?.dispose();
  }
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

// Models that refused to answer without thinking, so later requests leave reasoning to them.
const modelsThatMustThink = new Set<string>();

export async function openRouterChatCompletion(options: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The learner's 'openrouter.thinking' setting: thinking is off unless it is "model". */
  thinking?: unknown;
}): Promise<{content: string; usage?: Record<string, unknown>}> {
  const reasoning = modelsThatMustThink.has(options.model) ? undefined : reasoningForThinking(options.thinking);
  const ask = (withReasoning: boolean) => requestJson(OPENROUTER_CHAT_URL, options.apiKey, {
    model: options.model,
    temperature: options.temperature ?? 0.2,
    messages: options.messages,
    ...(withReasoning ? {reasoning} : {})
  }, {
    signal: options.signal,
    timeoutMs: options.timeoutMs
  });
  let data: any;
  try {
    data = await ask(Boolean(reasoning));
  } catch (error) {
    if (!reasoning || !(error instanceof OpenRouterHttpError) || !refusesAnswerWithoutThinking(error.status, error.message)) throw error;
    modelsThatMustThink.add(options.model);
    data = await ask(false);
  }
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
