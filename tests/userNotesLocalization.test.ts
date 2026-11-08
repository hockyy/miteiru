import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getLocalizedUserNote,
  getUserNoteKey,
  type MiteiruUserEntry,
  type UserNotesDatabase,
} from '../renderer/hooks/useUserNotes';
import { getUserNoteKeysToDelete } from '../renderer/components/Meaning/MeaningBox/hooks/useMeaningUserNotes';

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

describe('deleting a note', () => {
  it('removes both the localized note and a legacy one beside it', () => {
    const key = getUserNoteKey('海賊', 'ja');
    const notes = { [key]: note('new'), 海賊: note('legacy'), 他: note('other') };
    assert.deepEqual(getUserNoteKeysToDelete(notes, key, '海賊'), [key, '海賊']);
  });

  it('removes only what exists', () => {
    const key = getUserNoteKey('海賊', 'ja');
    assert.deepEqual(getUserNoteKeysToDelete({ 海賊: note('legacy') }, key, '海賊'), ['海賊']);
    assert.deepEqual(getUserNoteKeysToDelete({ [key]: note('new') }, key, '海賊'), [key]);
    assert.deepEqual(getUserNoteKeysToDelete({}, key, '海賊'), []);
  });
});
