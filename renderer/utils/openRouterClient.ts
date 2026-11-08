/**
 * OpenRouter streaming for Learn AI features.
 * Used by: hooks/useAiTranslation.ts, hooks/useSentenceAnalysis.ts
 * For non-streaming / fetch-based AI see MeaningBox.tsx (user notes generation).
 * API key + model settings: components/VideoPlayer/OpenRouterSettings.tsx
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { APICallError, streamText } from 'ai';
import { createAbortError } from './aiResultCache';
import { createThrottledEmitter } from './aiStreaming';
import { OPENROUTER_REQUEST_HEADERS } from './openRouterConstants';

// One wording for every AI feature (openRouterConstants.ts).
export { openRouterMessages } from './openRouterConstants';

/** What to tell the learner for OpenRouter's usual refusals; any other error keeps its own message. */
export function describeOpenRouterError(error: unknown): Error {
  if (APICallError.isInstance(error)) {
    switch (error.statusCode) {
      case 401:
        return new Error("OpenRouter didn't accept your key. Check it under OpenRouter AI in settings (press X).");
      case 402:
        return new Error('Your OpenRouter account is out of credits. Add some at openrouter.ai, or choose a free model.');
      case 429:
        return new Error('OpenRouter is getting too many requests right now. Wait a moment and try again.');
    }
  }
  return error instanceof Error ? error : new Error(String(error));
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
}

export async function streamOpenRouterCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  options?: StreamOptions,
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
    model: openrouter(model),
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
  return rawResponse;
}
