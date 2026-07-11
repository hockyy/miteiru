/**
 * Ruby HTML for sentence Anki cards.
 * Readings come from AI JSON segments; Miteiru builds the markup locally.
 */
import { escapeHtml } from '../components/Meaning/ankiExport';

export type SentenceRubySegment = {
  text: string;
  reading: string;
};

export const normalizeSentenceRubySegments = (value: unknown): SentenceRubySegment[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as { text?: unknown; surface?: unknown; reading?: unknown };
      const text = typeof record.text === 'string'
        ? record.text
        : typeof record.surface === 'string'
          ? record.surface
          : '';
      const reading = typeof record.reading === 'string' ? record.reading.trim() : '';

      return text ? { text, reading } : null;
    })
    .filter((segment): segment is SentenceRubySegment => Boolean(segment));
};

/** Builds escaped ruby HTML from AI segment readings. */
export function buildSentenceRubyHtmlFromSegments(segments: SentenceRubySegment[]): string {
  return segments.map(({ text, reading }) => {
    const surface = escapeHtml(text);
    if (!reading || reading === text) {
      return surface;
    }
    return `<ruby>${surface}<rt>${escapeHtml(reading)}</rt></ruby>`;
  }).join('');
}
