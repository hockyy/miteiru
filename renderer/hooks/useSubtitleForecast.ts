import {useEffect, useRef, useState} from 'react';
import {findLastLineStartingBy, type SubtitleContainer} from '../components/Subtitle/DataStructures';
import {useStoreData} from './useStoreData';
import {DEFAULT_OPENROUTER_MODEL} from '../utils/openRouterConstants';
import type {PlaybackClock} from '../utils/playbackClock';
import type {BoxRetokenization, BoxTip} from '../../main/helpers/boxTips';
import {isEnglishLearningText} from '../utils/learningTextLanguage';
import {validateForecastResult} from '../utils/forecastResponse';

/** One context batch serves both tips and reusable dictionary additions. Tokens never enter the prompt. */
export function useSubtitleForecast({subtitle, lang, clock, videoPath, shiftMs = 0}: {
  subtitle: SubtitleContainer; lang: string; clock: PlaybackClock; videoPath: string; shiftMs?: number;
}) {
  const [tipsEnabled, setTipsEnabled] = useStoreData('forecast.boxTips', false);
  const [dictionaryEnabled, setDictionaryEnabled] = useStoreData('userDictionary.enabled', false);
  const [lookahead, setLookahead] = useStoreData('forecast.lookaheadSeconds', 60);
  const [apiKey] = useStoreData('openrouter.apiKey', '');
  const [model] = useStoreData('openrouter.model', DEFAULT_OPENROUTER_MODEL);
  const [tips, setTips] = useState<BoxTip[]>([]);
  const [retokenizations, setRetokenizations] = useState<BoxRetokenization[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const horizon = lookahead === 30 ? 30 : 60;
  const horizonRef = useRef(horizon);
  horizonRef.current = horizon;
  const refreshWindow = useRef<(() => void) | null>(null);

  useEffect(() => { setTips([]); }, [subtitle, lang, videoPath]);

  useEffect(() => {
    setRetokenizations([]);
    setError('');
    setBusy(false);
    if ((!tipsEnabled && !dictionaryEnabled) || !videoPath || !lang) return;
    // Settings → AI already says a key is needed; there is nothing to retry until one is added.
    if (!apiKey.trim()) return;
    let disposed = false;
    let active: {id: string; bucket: number; cancelled?: boolean} | null = null;
    let desired: {key: string; bucket: number; cues: {from: number; to: number; text: string}[]}[] = [];
    const attempted = new Set<string>();
    const preparedWindows: {from: number; to: number; text: string}[][] = [];
    let lastSecond = -1;
    let failed = false;
    const subtitleSeconds = () => Math.max(0, clock.get() - shiftMs / 1000);
    const cancel = () => {
      if (active && !active.cancelled) {
        active.cancelled = true;
        window.backend.invoke('box-tips:cancel', active.id).catch(() => undefined);
      }
    };
    const pump = async () => {
      if (disposed || clock.isPreviewing() || failed || active) return;
      // Current context always wins over prefetch. Covered neighboring windows reuse paid work.
      const batch = desired.find((candidate) => {
        if (attempted.has(candidate.key)) return false;
        if (preparedWindows.some((prepared) => candidate.cues.every((cue) => prepared.some((known) =>
          known.text === cue.text && known.from <= cue.from && known.to >= cue.to)))) {
          attempted.add(candidate.key);
          return false;
        }
        return true;
      });
      if (!batch) return;
      attempted.add(batch.key);
      const id = crypto.randomUUID();
      active = {id, bucket: batch.bucket};
      setBusy(true);
      setError('');
      try {
        const result = validateForecastResult(await window.backend.invoke('box-tips:generate', {
          requestId: id, lang, cues: batch.cues, includeTips: tipsEnabled, includeDictionary: dictionaryEnabled
        }));
        if (disposed) return;
        if (result.cancelled) { attempted.delete(batch.key); return; }
        if (clock.isPreviewing()) { attempted.delete(batch.key); return; }
        if (!result.ok) throw new Error(result.error || 'Could not prepare this learning batch.');
        // A seek can leave an old batch in flight. Its notes never replace the new video's notes.
        if (Math.abs(Math.floor(subtitleSeconds() / 30) - batch.bucket) > 2) { attempted.delete(batch.key); return; }
        preparedWindows.push(batch.cues);
        if (preparedWindows.length > 8) preparedWindows.shift();
        // Retain prepared notes for red timeline markers and immediate read-back after a seek.
        if (tipsEnabled) setTips((old) => [...new Map([...old, ...result.tips.filter((tip) => isEnglishLearningText(tip.text))]
          .map((tip) => [`${tip.from}:${tip.to}`, tip])).values()].sort((a, b) => a.from - b.from));
        if (dictionaryEnabled && result.dictionaryEntries?.length) {
          const saved = await window.backend.invoke('user-dictionary:upsert', result.dictionaryEntries.map((entry) => ({...entry, source: 'ai'})));
          if (!disposed && !saved.ok) throw new Error(saved.error || 'Could not save dictionary additions.');
        }
        // Missing entries are saved first, so clicking a freshly split word can resolve its meaning.
        if (!disposed && dictionaryEnabled && result.retokenizations?.length) {
          setRetokenizations((old) => [...new Map([...old.filter((cue) => cue.to > (subtitleSeconds() - 60) * 1000), ...result.retokenizations]
            .map((cue) => [`${cue.from}:${cue.to}:${cue.text}`, cue])).values()].sort((a, b) => a.from - b.from).slice(-192));
        }
      } catch (failure) {
        if (!disposed) { failed = true; setError(failure instanceof Error ? failure.message : String(failure)); }
      } finally {
        active = null;
        if (!disposed) { setBusy(false); void pump(); }
      }
    };
    const update = (force = false) => {
      if (disposed) return;
      if (clock.isPreviewing()) {
        desired = [];
        lastSecond = -1;
        cancel();
        return;
      }
      const seconds = subtitleSeconds();
      const second = Math.floor(seconds);
      if (!force && second === lastSecond) return;
      lastSecond = second;
      // Clock movement during playback or a seek selects a new batch; pausing never polls the API.
      const bucket = Math.floor(seconds / 30);
      const buckets = horizonRef.current === 30 ? [bucket, bucket + 1, bucket - 1].filter((value) => value >= 0) : [bucket];
      desired = buckets.flatMap((targetBucket) => {
        const start = targetBucket * 30 * 1000;
        const end = start + horizonRef.current * 1000;
        const first = Math.max(0, findLastLineStartingBy(subtitle.lines, start));
        const cues: {from: number; to: number; text: string}[] = [];
        let characters = 0;
        for (let index = first; index < subtitle.lines.length && cues.length < 80; index++) {
          const line = subtitle.lines[index];
          if (line.timeStart >= end) break;
          if (line.timeEnd <= start || !line.text.trim()) continue;
          if (characters + line.text.length > 15_000) break;
          characters += line.text.length;
          cues.push({from: Math.max(start, line.timeStart), to: Math.min(end, line.timeEnd), text: line.text});
        }
        return cues.length ? [{key: JSON.stringify([targetBucket, cues]), bucket: targetBucket, cues}] : [];
      });
      if (active && Math.abs(active.bucket - bucket) > 2) cancel();
      void pump();
    };
    const unsubscribeClock = clock.subscribe(() => update());
    const unsubscribeSubtitle = subtitle.onChange(() => update(true));
    const refresh = () => update(true);
    refreshWindow.current = refresh;
    update(true);
    return () => {
      disposed = true;
      if (refreshWindow.current === refresh) refreshWindow.current = null;
      cancel(); unsubscribeClock(); unsubscribeSubtitle();
    };
  }, [subtitle, lang, clock, videoPath, shiftMs, tipsEnabled, dictionaryEnabled, apiKey, model, retry]);

  // Changing batch length never tears down a running request or clears its visible results.
  useEffect(() => { refreshWindow.current?.(); }, [horizon]);

  return {tipsEnabled, setTipsEnabled, dictionaryEnabled, setDictionaryEnabled, lookahead: horizon, setLookahead,
    tips, retokenizations, busy, error, retry: () => setRetry((old) => old + 1), hasApiKey: Boolean(apiKey.trim())};
}
