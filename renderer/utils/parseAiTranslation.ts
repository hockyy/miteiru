/** Parses AI translation JSON. Prompt schema: utils/aiTranslationPrompts.ts */
import {
  AITranslationResult,
  SentenceTranslation,
  TranslationChunkNote,
  TranslationGlossaryEntry,
  TranslationGrammarNote,
  TranslationVariant,
} from '../types/aiTranslation';
import { asString, extractJsonString } from './parseJsonResponse';

function parseGrammar(value: unknown): TranslationGrammarNote[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const pattern = asString((item as TranslationGrammarNote).pattern);
      const explanation = asString((item as TranslationGrammarNote).explanation);
      if (!pattern && !explanation) {
        return null;
      }
      return { pattern, explanation };
    })
    .filter((item): item is TranslationGrammarNote => item !== null);
}

function parseVariant(value: unknown): TranslationVariant {
  if (!value || typeof value !== 'object') {
    return { text: '', pronunciation: '' };
  }
  const item = value as TranslationVariant;
  return {
    text: asString(item.text),
    pronunciation: asString(item.pronunciation),
  };
}

function parseGlossary(value: unknown): TranslationGlossaryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const entry = item as TranslationGlossaryEntry;
      const target = asString(entry.target);
      const meaning = asString(entry.meaning);
      if (!target && !meaning) {
        return null;
      }
      return {
        source: asString(entry.source),
        target,
        reading: asString(entry.reading),
        meaning,
      };
    })
    .filter((item): item is TranslationGlossaryEntry => item !== null);
}

function parseChunks(value: unknown): TranslationChunkNote[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const validRegisters = new Set(['formal', 'neutral', 'casual']);
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const chunk = item as TranslationChunkNote;
      const register = asString(chunk.register).toLowerCase();
      if (!validRegisters.has(register)) {
        return null; // ignore unknown register labels from model
      }
      return {
        register: register as TranslationChunkNote['register'],
        chunk: asString(chunk.chunk),
        note: asString(chunk.note),
      };
    })
    .filter((item): item is TranslationChunkNote => item !== null && (!!item.chunk || !!item.note));
}

function parseSentence(value: unknown): SentenceTranslation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as SentenceTranslation;
  const source = asString(item.source);
  const formal = parseVariant(item.formal);
  const neutral = parseVariant(item.neutral);
  const casual = parseVariant(item.casual);

  const hasTranslation = formal.text || neutral.text || casual.text;
  if (!source && !hasTranslation) {
    return null;
  }

  return {
    source,
    formal,
    neutral,
    casual,
    grammar: parseGrammar(item.grammar),
    glossary: parseGlossary(item.glossary),
    chunks: parseChunks(item.chunks),
  };
}

export function parseAiTranslation(raw: string): AITranslationResult | null {
  const jsonString = extractJsonString(raw);
  if (!jsonString) {
    return null;
  }

  try {
    const data = JSON.parse(jsonString) as { sentences?: unknown };
    if (!Array.isArray(data.sentences)) {
      return null;
    }

    const sentences = data.sentences
      .map(parseSentence)
      .filter((item): item is SentenceTranslation => item !== null);

    return sentences.length > 0 ? { sentences } : null;
  } catch {
    return null;
  }
}

export function formatVariantForCopy(variant: TranslationVariant): string {
  // Clipboard: translation line, then reading on second line when present
  if (!variant.pronunciation) {
    return variant.text;
  }
  return `${variant.text}\n${variant.pronunciation}`;
}
