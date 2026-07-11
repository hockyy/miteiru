import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createInitialSentenceAnkiDraft,
  createSentenceAnkiCardFromDraft,
  getSentenceDeckName,
} from '../renderer/components/Meaning/ankiExport';
import { parseSentenceAnkiBack } from '../renderer/utils/parseSentenceAnkiBack';
import {
  buildSentenceRubyHtmlFromSegments,
  normalizeSentenceRubySegments,
} from '../renderer/utils/sentenceRuby';

describe('sentence Anki export', () => {
  it('parseSentenceAnkiBack builds ruby HTML from AI segments', () => {
    const raw = `\`\`\`json
{
  "translation": "See you the day after tomorrow.",
  "note": "あさって is the natural reading here.",
  "ruby": [
    { "text": "明後日", "reading": "あさって" },
    { "text": "会おう", "reading": "あおう" }
  ]
}
\`\`\``;

    const parsed = parseSentenceAnkiBack(raw);
    assert.ok(parsed);
    assert.equal(parsed.translation, 'See you the day after tomorrow.');
    assert.match(parsed.rubyHtml, /明後日/);
    assert.match(parsed.rubyHtml, /あさって/);
    assert.match(parsed.rubyHtml, /<ruby>/);
    assert.doesNotMatch(parsed.rubyHtml, /みょうごにち/);
  });

  it('buildSentenceRubyHtmlFromSegments skips rt for kana-only segments', () => {
    const html = buildSentenceRubyHtmlFromSegments([
      { text: 'ね', reading: '' },
      { text: '明後日', reading: 'あさって' },
    ]);
    assert.equal(html, 'ね<ruby>明後日<rt>あさって</rt></ruby>');
  });

  it('exports sentence cards to the Sentence deck', () => {
    const draft = createInitialSentenceAnkiDraft({
      sourceSentence: '明後日会おう',
      lang: 'ja',
      rubyHtml: '<ruby>明後日<rt>あさって</rt></ruby>会おう',
      translation: 'See you the day after tomorrow.',
      note: '',
    });
    const card = createSentenceAnkiCardFromDraft(draft);

    assert.equal(getSentenceDeckName('ja'), 'Miteiru::Japanese::Sentence');
    assert.equal(draft.deckName, 'Miteiru::Japanese::Sentence');
    assert.equal(card.deckName, 'Miteiru::Japanese::Sentence');
    assert.match(card.tags, /sentence/);
    assert.doesNotMatch(card.tags, /\bhard\b/);
  });
});

describe('parseSentenceAnkiBack legacy', () => {
  it('parses fenced JSON without ruby segments', () => {
    const raw = `\`\`\`json
{
  "translation": "I am going to the store.",
  "note": "Uses 行く for movement toward a destination."
}
\`\`\``;

    const parsed = parseSentenceAnkiBack(raw);
    assert.ok(parsed);
    assert.equal(parsed.translation, 'I am going to the store.');
    assert.equal(parsed.rubyHtml, '');
  });

  it('returns null for invalid JSON', () => {
    assert.equal(parseSentenceAnkiBack('not json'), null);
  });
});

describe('normalizeSentenceRubySegments', () => {
  it('accepts surface alias and drops empty segments', () => {
    assert.deepEqual(
      normalizeSentenceRubySegments([
        { surface: '明後日', reading: 'あさって' },
        { text: '', reading: 'x' },
      ]),
      [{ text: '明後日', reading: 'あさって' }],
    );
  });
});
