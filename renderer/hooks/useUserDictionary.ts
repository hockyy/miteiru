import {useCallback, useEffect, useState} from 'react';

export type UserDictionaryEntry = {surface: string; reading: string; meaning: string; language: string; source: 'ai' | 'manual'; updatedAt: number};

export function useUserDictionary(lang: string) {
  const [entries, setEntries] = useState<UserDictionaryEntry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!lang) { setEntries([]); setError(''); return; }
    let disposed = false;
    let version = 0;
    const refresh = async () => {
      const run = ++version;
      try {
        const result = await window.backend.invoke('user-dictionary:list', lang);
        if (disposed || version !== run) return;
        if (!result.ok) throw new Error(result.error || 'Could not read your dictionary.');
        setEntries(result.entries);
        setError('');
      } catch (failure) { if (!disposed) setError(String(failure)); }
    };
    void refresh();
    const unsubscribe = window.backend.on('user-dictionary:changed', () => { void refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [lang]);
  const save = useCallback(async (entry: {surface: string; reading: string; meaning: string}) => {
    const result = await window.backend.invoke('user-dictionary:upsert', [{...entry, language: lang, source: 'manual'}]);
    if (!result.ok) throw new Error(result.error || 'Could not save this entry.');
    setError('');
  }, [lang]);
  const remove = useCallback(async (surface: string) => {
    try {
      const result = await window.backend.invoke('user-dictionary:delete', {language: lang, surface});
      if (!result.ok) throw new Error(result.error || 'Could not delete this entry.');
      setError('');
    } catch (failure) { setError(String(failure)); }
  }, [lang]);
  return {entries, error, save, remove};
}
