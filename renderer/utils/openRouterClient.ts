/**
 * OpenRouter streaming for Learn AI features.
 * Used by: hooks/useAiTranslation.ts, hooks/useSentenceAnalysis.ts
 * For non-streaming / fetch-based AI see MeaningBox.tsx (user notes generation).
 * API key + model settings: components/VideoPlayer/LearningSidebar.tsx
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';

const MITEIRU_OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://github.com/hockyy/miteiru',
  'X-Title': 'Miteiru',
};

export const openRouterMessages = {
  missingApiKey: 'Please set your OpenRouter API key in settings (Ctrl+X).',
  missingModel: 'Please set and save your AI model in settings (Ctrl+X).',
};

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
    headers: MITEIRU_OPENROUTER_HEADERS,
  });

  const result = await streamText({
    model: openrouter(model),
    messages,
  });

  // Collect full response before JSON parse (hooks don't stream partial UI)
  let rawResponse = '';
  for await (const chunk of result.textStream) {
    rawResponse += chunk;
  }
  return rawResponse;
}
