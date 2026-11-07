const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

const decodeEntities = (value: string): string =>
  value.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (match) => ENTITIES[match] ?? match);

const stripTags = (value: string): string => value.replace(/<[^>]*>/g, '');

/**
 * Plain text for ruby markup: a reading goes in parentheses after the word it annotates, so
 * `<ruby>食<rt>た</rt></ruby>べる` becomes `食(た)べる`. A reading that is empty or the same as the
 * word is left out.
 */
export const rubyHtmlToPlainText = (html: string): string => {
  if (!html) return '';
  const withReadings = html.replace(
    /<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi,
    (_match, inner: string) => {
      const reading = stripTags(
        Array.from(inner.matchAll(/<rt\b[^>]*>([\s\S]*?)<\/rt>/gi)).map((m) => m[1]).join(''),
      ).trim();
      const base = stripTags(
        inner.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '').replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, ''),
      );
      return reading && reading !== base ? `${base}(${reading})` : base;
    },
  );
  // Entities are decoded last, so a decoded `<` is never mistaken for a tag.
  return decodeEntities(stripTags(withReadings));
};

/**
 * Copies ruby markup so it pastes as ruby into rich editors and as `食(た)べる` into plain ones.
 * Without `ClipboardItem` the plain form is written alone.
 */
export const writeRubyToClipboard = async (html: string): Promise<void> => {
  const plain = rubyHtmlToPlainText(html);
  if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(plain);
};
