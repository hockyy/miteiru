/**
 * JSON extraction helpers for AI responses that return structured JSON (often fenced in ```json).
 * Used by: utils/parseAiTranslation.ts, utils/parseSentenceAnalysis.ts
 * Prompt schemas: utils/aiTranslationPrompts.ts, utils/aiAnalysisPrompts.ts
 */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asString).filter(Boolean);
}

export function extractJsonString(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  // Fallback: grab outermost { ... } if model skipped code fences
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed.startsWith('{') ? trimmed : null;
}
