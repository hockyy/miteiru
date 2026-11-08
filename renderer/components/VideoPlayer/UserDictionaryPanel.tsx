import React, {useId, useState} from 'react';
import {ModalShell} from '../Utils/ModalShell';
import {Button} from '../Utils/Button';
import {SIDEBAR_FIELD_INPUT} from './SidebarShell';
import type {useUserDictionary, UserDictionaryEntry} from '../../hooks/useUserDictionary';

const ROW_LIMIT = 100;
const EMPTY_DRAFT = {surface: '', reading: '', meaning: ''};
const FIELD = `${SIDEBAR_FIELD_INPUT} w-full`;
const CHIP = 'shrink-0 rounded-full px-2 text-[11px] font-bold ring-1';
const ROW_ACTION = 'rounded text-xs font-semibold text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
const learningFont = {fontFamily: 'var(--miteiru-subtitle-font)'};

/** Entries whose word, reading or meaning contain the search text, in the dictionary's order. */
export const searchDictionaryEntries = (entries: readonly UserDictionaryEntry[], query: string) => {
  const needle = query.trim().toLowerCase();
  return needle ? entries.filter((entry) => `${entry.surface} ${entry.reading} ${entry.meaning}`.toLowerCase().includes(needle)) : [...entries];
};

export const SourceChip = ({source}: {source: UserDictionaryEntry['source']}) => source === 'ai'
  ? <span className={`${CHIP} bg-amber-300/15 text-amber-200 ring-amber-300/30`}>AI</span>
  : <span className={`${CHIP} bg-sky-300/15 text-sky-200 ring-sky-300/30`}>You</span>;

/** Words the user added, or the AI added for them; shown over the video, so dark like the settings. */
export function UserDictionaryPanel({isOpen, onClose, dictionary, languageName}: {
  isOpen: boolean; onClose: () => void; dictionary: ReturnType<typeof useUserDictionary>; languageName: string;
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ids = {word: useId(), reading: useId(), meaning: useId(), search: useId()};
  if (!isOpen) return null;
  const edit = (entry: UserDictionaryEntry) => {
    setDraft({surface: entry.surface, reading: entry.reading, meaning: entry.meaning});
    setEditing(true);
    setError('');
  };
  const clear = () => { setDraft(EMPTY_DRAFT); setEditing(false); setError(''); };
  const save = async () => {
    setSaving(true);
    try { await dictionary.save(draft); clear(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); }
  };
  const matches = searchDictionaryEntries(dictionary.entries, query);
  const shown = matches.slice(0, ROW_LIMIT);
  const shownError = error || dictionary.error;
  return <ModalShell title={`Your ${languageName} dictionary`} onClose={onClose} maxWidthClassName="max-w-2xl"
    footer={<div className="flex justify-end"><Button type="primary" onPress={onClose}>Done</Button></div>}>
    <div className="space-y-5 text-sm text-white/85">
      <section aria-label={editing ? 'Edit entry' : 'Add an entry'} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.word} className="text-xs font-bold text-white/70">Word</label>
            <input id={ids.word} className={FIELD} style={learningFont} value={draft.surface}
                   onChange={(event) => setDraft({...draft, surface: event.target.value})}/>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.reading} className="text-xs font-bold text-white/70">Reading</label>
            <input id={ids.reading} className={FIELD} style={learningFont} value={draft.reading}
                   onChange={(event) => setDraft({...draft, reading: event.target.value})}/>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.meaning} className="text-xs font-bold text-white/70">Meaning</label>
          <input id={ids.meaning} className={FIELD} value={draft.meaning}
                 onChange={(event) => setDraft({...draft, meaning: event.target.value})}/>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="primary" size="small" disabled={saving || !draft.surface.trim() || !draft.meaning.trim()} onPress={save}>Save</Button>
          {editing && <Button type="link" onPress={clear}>Cancel</Button>}
        </div>
        {shownError && <p role="alert" className="text-xs text-red-200">{shownError}</p>}
      </section>

      <section aria-label="Your words" className="space-y-3 border-t border-white/10 pt-4">
        <label htmlFor={ids.search} className="sr-only">Search your dictionary</label>
        <input id={ids.search} type="search" className={FIELD} placeholder="Search" value={query}
               onChange={(event) => setQuery(event.target.value)}/>
        {dictionary.entries.length === 0
          ? <p className="text-white/60">No words yet. AI word splitting adds the words your dictionaries miss, or add one above.</p>
          : matches.length === 0 ? <p className="text-white/60">No words match.</p>
          : <ul className="space-y-2">
            {shown.map((entry) => <li key={`${entry.language}:${entry.surface}`} className="rounded-xl bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 break-words text-base font-bold" style={learningFont}>{entry.surface}</span>
                {entry.reading && <span className="min-w-0 break-words text-white/55" style={learningFont}>{entry.reading}</span>}
                <SourceChip source={entry.source}/>
                <span className="ml-auto flex shrink-0 items-center gap-3">
                  <button type="button" className={ROW_ACTION} onClick={() => edit(entry)}>Edit</button>
                  <button type="button" className={`${ROW_ACTION} hover:text-red-300`} aria-label={`Remove ${entry.surface}`}
                          onClick={() => dictionary.remove(entry.surface)}>Remove</button>
                </span>
              </div>
              <div className="mt-1 break-words text-white/80">{entry.meaning}</div>
            </li>)}
          </ul>}
        {matches.length > ROW_LIMIT && <p className="text-xs text-white/60">Showing {ROW_LIMIT} of {matches.length} words. Search to narrow it down.</p>}
      </section>
    </div>
  </ModalShell>;
}
