import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAnkiCardsForGrammarEntry,
  collectGrammarAnkiCards,
  getGrammarDeckName,
  hasGrammarAnkiContent,
} from '../renderer/components/Meaning/grammarAnkiExport';
import { JpGrammarEntry } from '../renderer/types/jpGrammar';

const sampleEntry: JpGrammarEntry = {
  id: 'N5-3',
  level: 'N5',
  index: 3,
  form: 'だけ',
  reading: 'dake',
  meaning: 'only; just',
};

const sampleNotes = {
  'N5-3': {
    usageNote: 'Follows nouns.',
    funFact: 'Very common.',
    examples: [{ sentence: 'これだけ。', meaning: 'Only this.' }],
    relatedGrammar: ['のみ'],
    updatedAt: 1,
  },
};

describe('grammarAnkiExport', () => {
  it('detects exportable grammar note content', () => {
    assert.equal(hasGrammarAnkiContent(null), false);
    assert.equal(hasGrammarAnkiContent({ examples: [], usageNote: '', funFact: '', relatedGrammar: [], updatedAt: 0 }), false);
    assert.equal(hasGrammarAnkiContent(sampleNotes['N5-3']), true);
  });

  it('uses Grammar deck name', () => {
    assert.equal(getGrammarDeckName('ja'), 'Miteiru::Japanese::Grammar');
  });

  it('builds reading and recall cards per grammar point', () => {
    const cards = buildAnkiCardsForGrammarEntry(sampleEntry, sampleNotes['N5-3'], 'ja');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].deckName, 'Miteiru::Japanese::Grammar');
    assert.match(cards[0].front, /だけ/);
    assert.match(cards[0].back, /only; just/);
    assert.match(cards[1].front, /only; just/);
    assert.match(cards[1].back, /だけ/);
  });

  it('collects cards only for grammar ids with AI notes in catalog', () => {
    const cards = collectGrammarAnkiCards([sampleEntry], {
      ...sampleNotes,
      'N5-99': { examples: [], usageNote: '', funFact: '', relatedGrammar: [], updatedAt: 0 },
      'N4-1': sampleNotes['N5-3'],
    }, 'ja');

    assert.equal(cards.length, 2);
  });
});
