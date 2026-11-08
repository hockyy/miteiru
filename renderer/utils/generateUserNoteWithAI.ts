import {
  buildUserNoteSystemPrompt,
  buildUserNoteUserPrompt,
  parseUserNoteAiResponse,
} from './aiUserNotePrompts';
import { MITEIRU_REPO_URL } from './constants';
import {
  modelMustThink,
  readThinkingSetting,
  rememberModelMustThink,
} from './openRouterClient';
import {
  openRouterMessages,
  openRouterStatusMessage,
  reasoningForThinking,
  refusesAnswerWithoutThinking,
} from './openRouterConstants';
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
    throw new Error(openRouterMessages.missingApiKey);
  }

  const reasoning = modelMustThink(openRouterModel) ? undefined : reasoningForThinking(await readThinkingSetting());
  const ask = (withReasoning: boolean) => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': MITEIRU_REPO_URL,
      'X-Title': 'Miteiru',
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: [
        { role: 'system', content: buildUserNoteSystemPrompt(lang) },
        { role: 'user', content: buildUserNoteUserPrompt(term, lang) },
      ],
      ...(withReasoning ? { reasoning } : {}),
    }),
  });

  let response = await ask(Boolean(reasoning));
  if (!response.ok && reasoning && response.status === 400) {
    // Some models can't answer without thinking: remember that and ask again, leaving it to them.
    const text = await response.text().catch(() => '');
    if (refusesAnswerWithoutThinking(response.status, text)) {
      rememberModelMustThink(openRouterModel);
      response = await ask(false);
    }
  }

  if (!response.ok) {
    throw new Error(openRouterStatusMessage(response.status) ?? `API request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseUserNoteAiResponse(content);
};
