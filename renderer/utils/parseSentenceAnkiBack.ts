/** Parses AI sentence Anki JSON. Prompt schema: utils/aiAnkiPrompts.ts */
import {
  emptySentenceAnkiBackContent,
  SentenceAnkiBackContent,
} from '../types/sentenceAnki';
import { asString, extractJsonString } from './parseJsonResponse';
import {
  buildSentenceRubyHtmlFromSegments,
  normalizeSentenceRubySegments,
} from './sentenceRuby';

export function parseSentenceAnkiBack(raw: string): SentenceAnkiBackContent | null {
  const jsonString = extractJsonString(raw);
  if (!jsonString) {
    return null;
  }

  try {
    const data = JSON.parse(jsonString) as {
      translation?: unknown;
      note?: unknown;
      ruby?: unknown;
    };
    const content = emptySentenceAnkiBackContent();
    content.translation = asString(data.translation);
    content.note = asString(data.note);
    content.rubyHtml = buildSentenceRubyHtmlFromSegments(normalizeSentenceRubySegments(data.ruby));

    return content.translation || content.note || content.rubyHtml ? content : null;
  } catch {
    return null;
  }
}
