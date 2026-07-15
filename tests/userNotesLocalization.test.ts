import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getLocalizedUserNote,
  getUserNoteKey,
  type MiteiruUserEntry,
  type UserNotesDatabase,
} from '../renderer/hooks/useUserNotes';

const note = (definition: string): MiteiruUserEntry => ({
  definition,
  examples: [],
  usageNote: '',
  funFact: '',
  relatedTerms: [],
});

describe('localized user notes', () => {
  it('keeps an identical term separate by language', () => {
    const notes: UserNotesDatabase = {
      [getUserNoteKey('海賊', 'ja')]: note('pirate'),
      [getUserNoteKey('海賊', 'zh')]: note('sea robber'),
    };

    assert.equal(getLocalizedUserNote(notes, '海賊', 'ja')?.definition, 'pirate');
    assert.equal(getLocalizedUserNote(notes, '海賊', 'zh')?.definition, 'sea robber');
  });

  it('falls back to legacy term-only notes', () => {
    const notes: UserNotesDatabase = {
      海賊: note('legacy note'),
    };

    assert.equal(getLocalizedUserNote(notes, '海賊', 'ja')?.definition, 'legacy note');
  });
});
