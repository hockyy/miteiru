import React, {useRef, useState} from 'react';
import {getUserDictionaryProvenance} from '../../userDictionaryProvenance';
import {MEANING_ACTION_BTN, MEANING_TAG} from '../../meaningBoxTheme';
import type {MeaningContentState} from '../types';

/** Stored additions have their own provenance and removal action; built-in entries never do. */
export function UserDictionaryEntryNotice({entry, lang}: {entry: MeaningContentState; lang: string}) {
  const provenance = getUserDictionaryProvenance(entry, lang);
  const identity = provenance ? `${provenance.language}\0${provenance.surface}` : '';
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  const [status, setStatus] = useState({identity: '', pending: false, removed: false, error: ''});
  if (!provenance) return null;
  const current = status.identity === identity ? status : null;
  const remove = async () => {
    if (current?.pending || current?.removed) return;
    setStatus({identity, pending: true, removed: false, error: ''});
    try {
      const result = await window.backend.invoke('user-dictionary:delete', {
        language: provenance.language, surface: provenance.surface
      });
      if (!result?.ok) throw new Error(result?.error || 'Could not delete this dictionary entry.');
      if (latestIdentity.current === identity) setStatus({identity, pending: false, removed: true, error: ''});
    } catch (error) {
      if (latestIdentity.current === identity) setStatus({identity, pending: false, removed: false,
        error: error instanceof Error ? error.message : String(error)});
    }
  };
  return <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
    <span className={provenance.source === 'ai'
      ? 'rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-300'
      : MEANING_TAG}>
      {provenance.source === 'ai' ? 'Added by AI' : 'Your entry'}
    </span>
    <span className="min-w-0 flex-1 text-xs text-blue-900/70">Not from the built-in dictionary.</span>
    <button type="button" className={`${MEANING_ACTION_BTN} hover:text-red-700`}
      aria-label={`Delete user dictionary entry ${provenance.surface}`} disabled={Boolean(current?.pending || current?.removed)} onClick={remove}>
      {current?.pending ? 'Removing…' : current?.removed ? 'Removed' : 'Remove'}
    </button>
    {current?.error && <p role="alert" className="basis-full text-xs text-red-700">{current.error}</p>}
  </div>;
}
