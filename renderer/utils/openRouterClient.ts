/**
 * OpenRouter streaming for Learn AI features.
 * Used by: hooks/useAiTranslation.ts, hooks/useSentenceAnalysis.ts
 * For non-streaming / fetch-based AI see MeaningBox.tsx (user notes generation).
 * API key + model settings: components/VideoPlayer/OpenRouterSettings.tsx
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { OPENROUTER_REQUEST_HEADERS } from './openRouterConstants';

// One wording for every AI feature (openRouterConstants.ts).
export { openRouterMessages } from './openRouterConstants';

type OpenRouterMessage = {
  role: 'system' | 'user';
  content: string;
};

export async function streamOpenRouterCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
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

  const result = await streamText({
    model: openrouter(model),
    ...(systemContent ? { system: systemContent } : {}),
    messages: userMessages,
  });

  // Collect full response before JSON parse (hooks don't stream partial UI)
  let rawResponse = '';
  for await (const chunk of result.textStream) {
    rawResponse += chunk;
  }
  return rawResponse;
}
