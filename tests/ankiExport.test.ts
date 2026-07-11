import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAnkiCardsForTerm,
  getAnkiDeckNames,
  hasAnkiNoteContent,
} from '../renderer/components/Meaning/ankiExport';
import {
  buildRubyHtmlFromRomajiedData,
  getPrimaryRomajiedVariant,
} from '../renderer/components/Meaning/meaningEntries';

const meaningContent = {
  content: '食べる',
  single: [{ text: '食べる' }],
};

const romajiedData = [{
  key: 0,
  romajied: [{
    hiragana: 'たべる',
    separation: [
      { main: '食', hiragana: 'た' },
      { main: 'べる', hiragana: 'べる' },
    ],
  }],
}];

const userNote = {
  definition: 'to eat',
  usageNote: '',
  funFact: '',
  examples: [],
  relatedTerms: [],
  updatedAt: 1,
};

describe('ankiExport', () => {
  it('detects exportable user note content', () => {
    assert.equal(hasAnkiNoteContent(null), false);
    assert.equal(hasAnkiNoteContent({
      definition: '',
      usageNote: '',
      funFact: '',
      examples: [],
      relatedTerms: [],
      updatedAt: 0,
    }), false);
    assert.equal(hasAnkiNoteContent(userNote), true);
  });

  it('routes noted terms to the Notes deck', () => {
    const decks = getAnkiDeckNames('ja', true);
    assert.equal(decks.readingDeckName, 'Miteiru::Japanese::Notes');
    assert.equal(decks.hardDeckName, 'Miteiru::Japanese::Notes');
  });

  it('exports one Notes card with ruby front instead of reading and hard variants', async () => {
    const cards = await createAnkiCardsForTerm({
      term: '食べる',
      lang: 'ja',
      tokenizeMiteiru: async () => [],
      userNote,
      meaningContent,
      romajiedData,
    });

    assert.equal(cards.length, 1);
    assert.equal(cards[0].deckName, 'Miteiru::Japanese::Notes');
    assert.match(cards[0].front, /<ruby>/);
    assert.match(cards[0].back, /to eat/);
    assert.match(cards[0].tags, /notes/);
    assert.doesNotMatch(cards[0].tags, /\bhard\b/);
  });

  it('still exports Easy and Hard cards for dictionary-only terms', async () => {
    const cards = await createAnkiCardsForTerm({
      term: '食べる',
      lang: 'ja',
      tokenizeMiteiru: async () => [],
      userNote: null,
      meaningContent,
      romajiedData,
    });

    assert.equal(cards.length, 2);
    assert.equal(cards[0].deckName, 'Miteiru::Japanese::Easy');
    assert.equal(cards[1].deckName, 'Miteiru::Japanese::Hard');
    assert.match(cards[0].front, /<ruby>/);
    assert.doesNotMatch(cards[1].front, /<ruby>/);
  });

  it('uses only the first MeaningBox headword variant for ruby front', async () => {
    const multiVariantRomajiedData = [
      {
        key: 0,
        romajied: [{
          separation: [{ main: '抑', hiragana: 'そもそも' }],
        }],
      },
      {
        key: 1,
        romajied: [{
          separation: [
            { main: '抑', hiragana: 'そもそも' },
            { main: '々', hiragana: '々' },
          ],
        }],
      },
    ];

    const cards = await createAnkiCardsForTerm({
      term: '抑',
      lang: 'ja',
      tokenizeMiteiru: async () => [],
      userNote: null,
      meaningContent: {
        content: '抑',
        single: [{ text: '抑' }, { text: '抑々' }],
      },
      romajiedData: multiVariantRomajiedData,
    });

    const expectedRuby = buildRubyHtmlFromRomajiedData(getPrimaryRomajiedVariant(multiVariantRomajiedData));
    assert.match(cards[0].front, new RegExp(expectedRuby.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(cards[0].front, /々/);
  });
});
 