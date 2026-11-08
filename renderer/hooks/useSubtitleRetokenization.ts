import {useEffect, useRef} from 'react';
import {SubtitleContainer} from '../components/Subtitle/DataStructures';
import {applyAiSubtitleRetokenizations, clearAiSubtitleRetokenizations, SubtitleRetokenizer, type AiSubtitleRetokenization, type TokenizeMiteiru} from '../components/Subtitle/subtitleLanguageSupport';
import type {PlaybackClock} from '../utils/playbackClock';

/** Refresh affected cues in place. Old tokens stay on screen until their replacements are ready. */
export function useSubtitleRetokenization({subtitle, enabled, tokenizeMiteiru, clock, setFrequencyPrimary, aiRetokenizations = []}: {
  subtitle: SubtitleContainer; enabled: boolean; tokenizeMiteiru: TokenizeMiteiru; clock: PlaybackClock;
  setFrequencyPrimary: (frequency: Map<string, number>) => void;
  aiRetokenizations?: readonly AiSubtitleRetokenization[];
}) {
  const latest = useRef({tokenizeMiteiru, setFrequencyPrimary});
  latest.current = {tokenizeMiteiru, setFrequencyPrimary};
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const previousEnabled = useRef(enabled);
  const analyses = useRef(aiRetokenizations);
  analyses.current = aiRetokenizations;
  const controller = useRef<SubtitleRetokenizer | null>(null);
  useEffect(() => {
    const refresh = new SubtitleRetokenizer({
      subtitle,
      tokenizeMiteiru: (text) => latest.current.tokenizeMiteiru(text),
      getPlaybackTimeMs: () => clock.get() * 1000,
      onChanged: () => latest.current.setFrequencyPrimary(new Map(subtitle.frequency))
    });
    controller.current = refresh;
    const applyAnalyses = () => {
      if (enabledRef.current && applyAiSubtitleRetokenizations(subtitle, analyses.current)) {
        latest.current.setFrequencyPrimary(new Map(subtitle.frequency));
      }
    };
    const unsubscribeSubtitle = subtitle.onChange(applyAnalyses);
    applyAnalyses();
    const unsubscribe = window.backend.on('user-dictionary:changed', (change: {language?: string; surfaces?: string[]}) => {
      if (enabledRef.current && (!change.language || change.language === subtitle.language)) refresh.refresh(change.surfaces ?? []);
    });
    return () => { refresh.dispose(); controller.current = null; unsubscribe(); unsubscribeSubtitle(); };
  }, [subtitle, clock]);

  useEffect(() => {
    const changed = previousEnabled.current !== enabled;
    previousEnabled.current = enabled;
    if (!changed) return;
    let disposed = false;
    const refresh = controller.current;
    if (!enabled) refresh?.refreshLines(clearAiSubtitleRetokenizations(subtitle));
    // Removing an overlay can update visible tokens immediately, even if listing the stored
    // entries is slow. Listing also finds affected cues whose initial analysis is still pending.
    const visibleSurfaces = new Set<string>(!enabled ? subtitle.lines.flatMap((line) => Array.isArray(line.content)
      ? line.content.filter((token) => token.userDictionaryMeaning || token.userDictionaryId).map((token) => token.origin).filter(Boolean)
      : []) : []);
    refresh?.refresh([...visibleSurfaces]);
    window.backend.invoke('user-dictionary:list', subtitle.language).then((result) => {
      if (!disposed && controller.current === refresh && result?.ok && Array.isArray(result.entries)) {
        refresh?.refresh(result.entries.map((entry) => entry.surface).filter((surface) => !visibleSurfaces.has(surface)));
      }
    }).catch((error) => console.error('[user dictionary] could not list affected subtitle words', error));
    return () => { disposed = true; };
  }, [subtitle, enabled]);

  useEffect(() => {
    if (enabled && applyAiSubtitleRetokenizations(subtitle, aiRetokenizations)) {
      latest.current.setFrequencyPrimary(new Map(subtitle.frequency));
    }
  }, [subtitle, enabled, aiRetokenizations]);
}
