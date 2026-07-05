/** Parses AI sentence Anki back JSON. Prompt schema: utils/aiAnkiPrompts.ts */
import {
  emptySentenceAnkiBackContent,
  SentenceAnkiBackContent,
} from '../types/sentenceAnki';
import { asString, extractJsonString } from './parseJsonResponse';

export function parseSentenceAnkiBack(raw: string): SentenceAnkiBackContent | null {
  const jsonString = extractJsonString(raw);
  if (!jsonString) {
    return null;
  }

  try {
    const data = JSON.parse(jsonString) as Partial<SentenceAnkiBackContent>;
    const content = emptySentenceAnkiBackContent();
    content.translation = asString(data.translation);
    content.note = asString(data.note);

    return content.translation || content.note ? content : null;
  } catch {
    return null;
  }
}
