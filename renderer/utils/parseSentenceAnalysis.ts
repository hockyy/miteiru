/** Parses AI analysis JSON. Prompt schema: utils/aiAnalysisPrompts.ts */
import {
  emptySentenceAnalysis,
  GrammarPoint,
  SentenceAnalysis,
  VocabularyItem,
} from '../types/sentenceAnalysis';
import { asString, asStringArray, extractJsonString } from './parseJsonResponse';

/** Accepts a string or legacy { formal, neutral, casual } object from older prompts. */
function parseTranslation(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const data = value as { formal?: unknown; neutral?: unknown; casual?: unknown };
    return (
      asString(data.neutral) ||
      asString(data.formal) ||
      asString(data.casual)
    );
  }
  return '';
}

function parseGrammar(value: unknown): GrammarPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const pattern = asString((item as GrammarPoint).pattern);
      const explanation = asString((item as GrammarPoint).explanation);
      if (!pattern && !explanation) {
        return null;
      }
      return { pattern, explanation };
    })
    .filter((item): item is GrammarPoint => item !== null);
}

function parseVocabulary(value: unknown): VocabularyItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const word = asString((item as VocabularyItem).word);
      const meaning = asString((item as VocabularyItem).meaning);
      if (!word && !meaning) {
        return null;
      }
      const reading = asString((item as VocabularyItem).reading);
      const note = asString((item as VocabularyItem).note);
      return {
        word,
        meaning,
        ...(reading ? { reading } : {}),
        ...(note ? { note } : {}),
      };
    })
    .filter((item): item is VocabularyItem => item !== null);
}

export function parseSentenceAnalysis(raw: string): SentenceAnalysis | null {
  const jsonString = extractJsonString(raw);
  if (!jsonString) {
    return null;
  }

  try {
    const data = JSON.parse(jsonString) as Partial<SentenceAnalysis>;
    const analysis = emptySentenceAnalysis();
    analysis.summary = asString(data.summary);
    analysis.translation = parseTranslation(data.translation);
    analysis.grammar = parseGrammar(data.grammar);
    analysis.vocabulary = parseVocabulary(data.vocabulary);
    analysis.culturalNotes = asStringArray(data.culturalNotes);
    analysis.learningTips = asStringArray(data.learningTips);

    const hasContent =
      analysis.summary ||
      analysis.translation ||
      analysis.grammar.length > 0 ||
      analysis.vocabulary.length > 0 ||
      analysis.culturalNotes.length > 0 ||
      analysis.learningTips.length > 0;

    return hasContent ? analysis : null; // reject empty JSON shells
  } catch {
    return null;
  }
}

export function isAnalysisErrorMessage(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  return (
    lower.startsWith('please set your openrouter') ||
    lower.startsWith('please enter a sentence') ||
    lower.startsWith('analysis failed:')
  );
}
