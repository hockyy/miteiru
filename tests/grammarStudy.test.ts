import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeGrammarUserData,
  parseGrammarAiResponse,
  parseGrammarMoreExamplesResponse,
} from '../renderer/utils/aiGrammarPrompts';
import {
  filterGrammarByLevel,
  pickRandomGrammar,
} from '../renderer/utils/jpGrammarCatalog';
import { JpGrammarEntry } from '../renderer/types/jpGrammar';

const sampleEntries: JpGrammarEntry[] = [
  { id: 'N5-1', level: 'N5', index: 1, form: 'だけ', reading: 'dake', meaning: 'only' },
  { id: 'N4-1', level: 'N4', index: 1, form: 'ばかり', reading: 'bakari', meaning: 'only' },
];

describe('jpGrammarCatalog utils', () => {
  it('filters entries by JLPT level', () => {
    const n5Only = filterGrammarByLevel(sampleEntries, 'N5');
    assert.equal(n5Only.length, 1);
    assert.equal(n5Only[0].id, 'N5-1');
  });

  it('pickRandomGrammar returns null for empty list', () => {
    assert.equal(pickRandomGrammar([]), null);
  });
});

describe('aiGrammarPrompts', () => {
  it('parses grammar AI JSON response', () => {
    const raw = JSON.stringify({
      usageNote: 'Use after nouns.',
      funFact: 'Very common in speech.',
      examples: [{ sentence: 'これだけ。', meaning: 'Only this.' }],
      relatedGrammar: ['のみ'],
    });

    const parsed = parseGrammarAiResponse(raw);
    assert.equal(parsed.usageNote, 'Use after nouns.');
    assert.equal(parsed.examples.length, 1);
    assert.equal(parsed.relatedGrammar[0], 'のみ');
  });

  it('parses additional examples response', () => {
    const raw = JSON.stringify({
      examples: [{ sentence: '彼だけ来た。', meaning: 'Only he came.' }],
    });

    const parsed = parseGrammarMoreExamplesResponse(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].sentence, '彼だけ来た。');
  });

  it('normalizes grammar user data', () => {
    const normalized = normalizeGrammarUserData({
      usageNote: '  note ',
      examples: [{ sentence: 'test', meaning: 'test' }],
    });
    assert.equal(normalized.usageNote, 'note');
    assert.equal(normalized.examples.length, 1);
  });
});
