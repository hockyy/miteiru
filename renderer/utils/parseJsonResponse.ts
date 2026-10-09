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

/**
 * Like extractJsonString, for responses whose payload is a JSON array (e.g. subtitle cue translations).
 * Tries each fenced block, the whole reply, then each "[" up to the last "]", and returns the first
 * candidate that parses as an array; a reply that is a JSON object yields null, not an inner array.
 */
export function extractJsonArray(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsesAs = (candidate: string) => {
    try {
      const value = JSON.parse(candidate);
      return Array.isArray(value) ? 'array' : 'other';
    } catch {
      return 'invalid';
    }
  };

  const fences = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
  for (const candidate of [...fences, trimmed]) {
    const kind = parsesAs(candidate);
    if (kind === 'array') return candidate;
    if (kind === 'other') return null;
  }

  // Prose around the array: try each opening bracket (a few) up to the last closing one.
  const end = trimmed.lastIndexOf(']');
  for (let start = trimmed.indexOf('['), tries = 0; start !== -1 && start < end && tries < 20; start = trimmed.indexOf('[', start + 1), tries++) {
    const candidate = trimmed.slice(start, end + 1);
    if (parsesAs(candidate) === 'array') return candidate;
  }
  return null;
}
