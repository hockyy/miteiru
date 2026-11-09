/**
 * OpenRouter streaming for Learn AI features.
 * Used by: hooks/useAiTranslation.ts, hooks/useSentenceAnalysis.ts
 * For non-streaming / fetch-based AI see MeaningBox.tsx (user notes generation).
 * API key + model settings: components/VideoPlayer/OpenRouterSettings.tsx
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { APICallError, RetryError, streamText } from 'ai';
import { createAbortError } from './aiResultCache';
import { createThrottledEmitter } from './aiStreaming';
import {
  DEFAULT_OPENROUTER_THINKING,
  OPENROUTER_REQUEST_HEADERS,
  OPENROUTER_THINKING_KEY,
  openRouterStatusMessage,
  reasoningForThinking,
  refusesAnswerWithoutThinking,
} from './openRouterConstants';

// One wording for every AI feature (openRouterConstants.ts).
export { openRouterMessages } from './openRouterConstants';

/**
 * What to tell the learner for OpenRouter's usual refusals; any other error keeps its own message.
 * Also unwraps a RetryError (the SDK's report once its retries run out) and an error OpenRouter sent
 * inside the stream, which arrives as a plain object like {code: 429, message}.
 */
export function describeOpenRouterError(error: unknown): Error {
  const failure = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(failure)) {
    const message = failure.statusCode === undefined ? null : openRouterStatusMessage(failure.statusCode);
    return message ? new Error(message) : failure;
  }
  if (failure instanceof Error) {
    return failure;
  }
  if (failure && typeof failure === 'object') {
    const { code, message } = failure as { code?: unknown; message?: unknown };
    const friendly = typeof code === 'number' ? openRouterStatusMessage(code) : null;
    if (friendly) return new Error(friendly);
    if (typeof message === 'string') return new Error(message);
    try {
      return new Error(JSON.stringify(failure).slice(0, 300));
    } catch {
      return new Error('OpenRouter sent an error');
    }
  }
  return new Error(String(failure));
}

type OpenRouterMessage = {
  role: 'system' | 'user';
  content: string;
};

export interface StreamOptions {
  /** Cancels the request; the returned promise then rejects. */
  signal?: AbortSignal;
  /** Receives the text so far while it streams (at most every ~60 ms, and once more with the final text). */
  onText?: (text: string) => void;
  /** The thinking setting to use, instead of reading it from the store (the Study page puts it in its cache key). */
  thinking?: unknown;
}

type Reasoning = ReturnType<typeof reasoningForThinking>;

// Models that refused to answer without thinking, so later requests leave reasoning to them.
const modelsThatMustThink = new Set<string>();
export const modelMustThink = (model: string): boolean => modelsThatMustThink.has(model);
export const rememberModelMustThink = (model: string): void => {
  modelsThatMustThink.add(model);
};

/** The learner's thinking setting; off when the store can't be read (tests, a store error). */
export const readThinkingSetting = async (): Promise<unknown> => {
  try {
    return await window.miteiruStore?.get(OPENROUTER_THINKING_KEY, DEFAULT_OPENROUTER_THINKING);
  } catch {
    return DEFAULT_OPENROUTER_THINKING;
  }
};

/** Called once for a newly completed provider response, never when reading cached AI content. */
export const recordRendererOpenRouterUsage = async (usage: unknown): Promise<void> => {
  if (typeof window === 'undefined' || !window.backend?.invoke) return;
  const cost = usage && typeof usage === 'object' ? (usage as {cost?: unknown}).cost : undefined;
  try {
    await window.backend.invoke('ai-usage:record', {cost});
  } catch (error) {
    // A usage-store failure must not make the caller retry a paid request.
    console.warn('[AI usage] Could not record OpenRouter usage:', error);
  }
};

export async function streamOpenRouterCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  options?: StreamOptions,
): Promise<string> {
  const reasoning = modelMustThink(model) ? undefined : reasoningForThinking(options?.thinking ?? await readThinkingSetting());
  try {
    return await streamOnce(apiKey, model, messages, options, reasoning);
  } catch (error) {
    // Nothing has streamed yet when a request is refused, so asking again shows no doubled text.
    if (reasoning && APICallError.isInstance(error)
      && refusesAnswerWithoutThinking(error.statusCode, `${error.message} ${error.responseBody ?? ''}`)) {
      rememberModelMustThink(model);
      return streamOnce(apiKey, model, messages, options, undefined);
    }
    throw error;
  }
}

async function streamOnce(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  options: StreamOptions | undefined,
  reasoning: Reasoning,
): Promise<string> {
  const openrouter = createOpenRouter({
    apiKey,
    headers: OPENROUTER_REQUEST_HEADERS,
  });

  const systemContent = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const userMessages = messages.filter((message) => message.role !== 'system');

  // The text stream ends quietly when the request fails (a bad key, no credits, a dropped
  // connection): keep the error, so the caller shows the reason instead of "could not parse".
  let streamError: unknown;
  const result = await streamText({
    model: openrouter(model, reasoning ? { reasoning } : undefined),
    ...(systemContent ? { system: systemContent } : {}),
    messages: userMessages,
    ...(options?.signal ? { abortSignal: options.signal } : {}),
    onError: ({ error }) => {
      streamError ??= error;
    },
  });

  const emitter = options?.onText ? createThrottledEmitter(options.onText) : null;
  let rawResponse = '';
  try {
    for await (const chunk of result.textStream) {
      rawResponse += chunk;
      emitter?.push(rawResponse);
    }
    if (options?.signal?.aborted) {
      throw createAbortError(); // the SDK may just end the stream on abort
    }
    if (streamError !== undefined) {
      throw describeOpenRouterError(streamError);
    }
  } catch (error) {
    emitter?.cancel(); // no late partial update after a failed or cancelled stream
    throw error;
  }
  emitter?.flush(rawResponse);
  // The installed OpenRouter provider exposes the terminal response's charge here, separately
  // from the SDK's token counts. Missing charges are recorded as unknown without estimates.
  let usage: unknown;
  try {
    const metadata = await result.providerMetadata;
    usage = metadata?.openrouter?.usage;
  } catch { /* A completed text response remains useful even if its metadata is unavailable. */ }
  await recordRendererOpenRouterUsage(usage);
  return rawResponse;
}
