import React, {useState} from 'react';
import {ModalShell} from '../Utils/ModalShell';
import {Button} from '../Utils/Button';
import {AiUsageDetails} from './AiCostIndicator';
import type {useSubtitleForecast} from '../../hooks/useSubtitleForecast';
import type {useUserDictionary, UserDictionaryEntry} from '../../hooks/useUserDictionary';

export function VideoAiPanel({isOpen, onClose, forecast, dictionary, onGenerateAhead, languageName}: {
  isOpen: boolean; onClose: () => void; forecast: ReturnType<typeof useSubtitleForecast>;
  dictionary: ReturnType<typeof useUserDictionary>; onGenerateAhead?: () => void; languageName: string;
}) {
  const [draft, setDraft] = useState({surface: '', reading: '', meaning: ''});
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!isOpen) return null;
  const edit = (entry: UserDictionaryEntry) => setDraft({surface: entry.surface, reading: entry.reading, meaning: entry.meaning});
  const save = async () => {
    setSaving(true);
    try { await dictionary.save(draft); setDraft({surface: '', reading: '', meaning: ''}); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); }
  };
  const matches = dictionary.entries.filter((entry) => `${entry.surface} ${entry.reading} ${entry.meaning}`.toLowerCase().includes(query.toLowerCase()));
  const input = 'w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white';
  return <ModalShell title="AI learning tools" onClose={onClose} maxWidthClassName="max-w-2xl" footer={<Button type="secondary" onPress={onClose}>Keep watching</Button>}>
    <div className="space-y-5 text-sm text-white/85">
      <AiUsageDetails/>
      {!forecast.hasApiKey && <p className="text-amber-200">Add your OpenRouter key in video settings → AI to generate tips or subtitles.</p>}
      {onGenerateAhead && <div className="rounded-xl border border-white/10 p-3">
        <div className="mb-1 font-semibold">YouTube audio subtitles</div>
        <p className="mb-3 text-xs text-white/60">Generate and analyse only the audio near playback, then prepare upcoming segments.</p>
        <Button type="primary" onPress={onGenerateAhead}>Generate ahead…</Button>
      </div>}
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={forecast.tipsEnabled} onChange={(event) => forecast.setTipsEnabled(event.target.checked)}/>
        <span><span className="font-semibold">Box tips</span><span className="mt-1 block text-xs text-white/60">A short grammar or wordplay note for the current subtitle. Stays readable when you pause.</span></span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={forecast.dictionaryEnabled} onChange={(event) => forecast.setDictionaryEnabled(event.target.checked)}/>
        <span><span className="font-semibold">AI word splitting & user dictionary</span><span className="mt-1 block text-xs text-white/60">AI checks word boundaries and adds short contextual meanings. Existing words use your dictionaries; missing entries are saved for future videos.</span></span>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>Context per batch<span className="mt-1 block text-xs text-white/60">Changes apply to the next batch.</span></span>
        <select className="rounded-lg bg-white p-2 text-blue-950" value={forecast.lookahead} onChange={(event) => forecast.setLookahead(Number(event.target.value))}>
          <option value={30}>30 seconds</option><option value={60}>1 minute</option>
        </select>
      </label>
      {forecast.lookahead === 30 && <p className="text-xs text-white/60">Prepares the current 30 seconds first, then the next 30 seconds, then the previous 30 seconds. Cached segments are reused.</p>}
      <div role="status" className="text-xs text-white/65">{forecast.busy ? 'Preparing the next learning batch…' : forecast.tipsEnabled || forecast.dictionaryEnabled ? 'Ready for upcoming subtitle context. Completed batches are cached.' : 'Forecasting is off.'}</div>
      {forecast.error && <div className="text-red-200">{forecast.error} <Button type="secondary" size="small" onPress={forecast.retry}>Retry</Button></div>}
      <section className="space-y-3 border-t border-white/10 pt-4">
        <h3 className="font-semibold">Your {languageName} dictionary · {dictionary.entries.length}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={input} aria-label="Word or phrase" placeholder="Word or phrase" value={draft.surface} onChange={(event) => setDraft({...draft, surface: event.target.value})}/>
          <input className={input} aria-label="Reading" placeholder="Reading" value={draft.reading} onChange={(event) => setDraft({...draft, reading: event.target.value})}/>
        </div>
        <input className={input} aria-label="Dictionary meaning" placeholder="Reusable meaning" value={draft.meaning} onChange={(event) => setDraft({...draft, meaning: event.target.value})}/>
        <Button type="primary" size="small" disabled={saving || !draft.surface.trim() || !draft.meaning.trim()} onPress={save}>Save entry</Button>
        {(error || dictionary.error) && <p className="text-red-200">{error || dictionary.error}</p>}
        <input className={input} aria-label="Search your dictionary" placeholder="Search your entries" value={query} onChange={(event) => setQuery(event.target.value)}/>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {matches.slice(0, 100).map((entry) => <div key={`${entry.language}:${entry.surface}`} className="flex items-start gap-2 rounded-lg bg-white/5 p-2">
            <button type="button" onClick={() => edit(entry)} className="min-w-0 flex-1 text-left">
              <span className="font-semibold">{entry.surface}</span> <span className="text-xs text-white/60">{entry.reading}</span>
              <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${entry.source === 'ai' ? 'bg-amber-200/15 text-amber-200' : 'bg-sky-200/15 text-sky-200'}`}>{entry.source === 'ai' ? 'AI generated' : 'User dictionary'}</span>
              <span className="block text-xs text-white/75">{entry.meaning}</span>
            </button>
            <button type="button" aria-label={`Delete ${entry.surface}`} className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-red-200/40 hover:text-red-200" onClick={() => dictionary.remove(entry.surface)}>Delete</button>
          </div>)}
          {matches.length > 100 && <p className="text-xs text-white/60">Showing 100 entries. Search to narrow the list.</p>}
        </div>
      </section>
    </div>
  </ModalShell>;
}
