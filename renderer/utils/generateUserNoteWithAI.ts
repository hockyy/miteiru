import {
  buildUserNoteSystemPrompt,
  buildUserNoteUserPrompt,
  parseUserNoteAiResponse,
} from './aiUserNotePrompts';
import type { MiteiruUserEntry } from '../hooks/useUserNotes';

type GenerateUserNoteParams = {
  term: string;
  lang: string;
  openRouterApiKey: string;
  openRouterModel: string;
};

/** Calls OpenRouter to generate My Notes content for one vocabulary term. */
export const generateUserNoteWithAI = async ({
  term,
  lang,
  openRouterApiKey,
  openRouterModel,
}: GenerateUserNoteParams): Promise<MiteiruUserEntry> => {
  if (!openRouterApiKey) {
    throw new Error('Please set your OpenRouter API key in settings (Ctrl+X)');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://github.com/hockyy/miteiru',
      'X-Title': 'Miteiru',
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: [
        { role: 'system', content: buildUserNoteSystemPrompt(lang) },
        { role: 'user', content: buildUserNoteUserPrompt(term, lang) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseUserNoteAiResponse(content);
};
