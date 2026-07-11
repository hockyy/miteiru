import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getVocabNotePreview } from '../renderer/components/VideoPlayer/vocabNotePreview';
import { hasUserNoteContent } from '../renderer/hooks/useUserNotes';

describe('vocab note preview', () => {
  it('detects saved AI note content', () => {
    assert.equal(hasUserNoteContent(null), false);
    assert.equal(hasUserNoteContent({
      definition: '',
      usageNote: '',
      funFact: '',
      examples: [],
      relatedTerms: [],
    }), false);
    assert.equal(hasUserNoteContent({
      definition: 'to eat',
      usageNote: '',
      funFact: '',
      examples: [],
      relatedTerms: [],
    }), true);
  });

  it('builds a compact preview for sidebar cards', () => {
    assert.equal(getVocabNotePreview(null), null);
    assert.deepEqual(getVocabNotePreview({
      definition: 'to eat',
      usageNote: 'Use for food consumption.',
      funFact: 'Common verb.',
      examples: [{ sentence: 'ご飯を食べる。', meaning: 'I eat rice.' }],
      relatedTerms: ['飲む'],
    }), {
      definition: 'to eat',
      usageNote: 'Use for food consumption.',
      funFact: 'Common verb.',
      exampleCount: 1,
    });
  });
});
