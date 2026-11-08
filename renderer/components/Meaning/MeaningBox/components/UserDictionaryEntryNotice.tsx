import React, {useRef, useState} from 'react';
import {getUserDictionaryProvenance} from '../../userDictionaryProvenance';
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
  return <div className="mb-3 rounded-xl border border-amber-300/30 bg-amber-50 px-3 py-2 text-blue-950">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="rounded-md bg-amber-200 px-2 py-1 text-xs font-bold">
        {provenance.source === 'ai' ? 'AI generated' : 'User dictionary'}
      </span>
      <button type="button" className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
        aria-label={`Delete user dictionary entry ${provenance.surface}`} disabled={Boolean(current?.pending || current?.removed)} onClick={remove}>
        {current?.pending ? 'Deleting…' : current?.removed ? 'Deleted' : 'Delete entry'}
      </button>
    </div>
    <p className="mt-1 text-xs text-blue-950/70">
      {provenance.source === 'ai' ? 'Saved by AI. Separate from the built-in dictionary.' : 'Your saved entry. Separate from the built-in dictionary.'}
    </p>
    {current?.error && <p role="alert" className="mt-1 text-xs text-red-800">{current.error}</p>}
  </div>;
}
