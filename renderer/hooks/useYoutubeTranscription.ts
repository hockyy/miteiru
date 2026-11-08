import {useCallback, useEffect, useRef, useState} from 'react';
import {SubtitleContainer, isCurrentSubtitle, setGlobalSubtitleId, findLastLineStartingBy, type Line} from '../components/Subtitle/DataStructures';
import {fillSubtitleWithLearningContent, releaseLearningLines, type TokenizeMiteiru} from '../components/Subtitle/subtitleLanguageSupport';
import {getYoutubeVideoId} from '../utils/mediaUtils';
import {YoutubeTranscriptionScheduler, type YoutubeTranscriptionState} from '../utils/youtubeTranscription';
import {useStoreData} from './useStoreData';
import {ASR_MODELS, DEFAULT_ASR_MODEL, isKnownAsrModel} from '../utils/generateSubtitlesConfig';
import type {PlaybackClock} from '../utils/playbackClock';
import type {YoutubeTranscriptionSegmentResult} from '../types/youtubeTranscription';

const emptyState: YoutubeTranscriptionState = {activeSegment: null, completedSegments: 0, bufferedUntilSeconds: 0, error: null};

/** Updates one subtitle container in place; completed lines retain their tokens and subscriptions. */
export function useYoutubeTranscription(options: {
  videoPath: string; openedVideo: object; lang: string; clock: PlaybackClock; player: any;
  primarySub: SubtitleContainer; setPrimarySub: (subtitle: SubtitleContainer) => void;
  tokenizeMiteiru: TokenizeMiteiru; forceSimplified: boolean;
  setFrequencyPrimary: (frequency: Map<string, number>) => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const scheduler = useRef<YoutubeTranscriptionScheduler | null>(null);
  const container = useRef<SubtitleContainer | null>(null);
  const detach = useRef<() => void>(() => undefined);
  const generation = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState(emptyState);
  const [savedModel, setAsrModel] = useStoreData('subtitles.asrModel', DEFAULT_ASR_MODEL);
  const [apiKey] = useStoreData('openrouter.apiKey', '');
  const asrModel = isKnownAsrModel(savedModel) ? savedModel : DEFAULT_ASR_MODEL;

  const stop = useCallback(() => {
    generation.current++;
    scheduler.current?.dispose();
    scheduler.current = null;
    detach.current();
    detach.current = () => undefined;
    setEnabled(false);
    setState((old) => ({...old, activeSegment: null}));
  }, []);

  useEffect(() => {
    stop();
    container.current = null;
    setState(emptyState);
    setIsOpen(false);
    return stop;
  }, [options.openedVideo, options.lang, asrModel, stop]);

  useEffect(() => {
    if (enabled && container.current && options.primarySub.id !== container.current.id) stop();
  }, [enabled, options.primarySub.id, stop]);

  useEffect(() => { scheduler.current?.refreshEntries(); }, [options.forceSimplified]);

  const start = useCallback(() => {
    const current = latest.current;
    const videoId = getYoutubeVideoId(current.videoPath);
    if (!videoId || !apiKey.trim()) return;
    stop();
    const run = generation.current;
    const subtitle = new SubtitleContainer('', current.lang);
    subtitle.language = current.lang;
    container.current = subtitle;
    current.setPrimarySub(subtitle);
    setGlobalSubtitleId(subtitle.id);
    current.setFrequencyPrimary(new Map());
    setState(emptyState);
    setEnabled(true);
    let analysis = Promise.resolve();
    let presentLines = new Set<Line>();
    const scheduled = new WeakSet();
    const valid = () => generation.current === run && isCurrentSubtitle(subtitle.id);
    const controller = new YoutubeTranscriptionScheduler({
      videoId,
      requestSegment: async ({startSeconds, durationSeconds, signal}) => {
        const requestId = crypto.randomUUID();
        const cancel = () => { window.backend.invoke('youtube-transcription:cancel', requestId).catch(() => undefined); };
        signal.addEventListener('abort', cancel, {once: true});
        try {
          if (signal.aborted) throw new Error('Cancelled');
          const result = await window.backend.invoke('youtube-transcription:segment', {
            videoPath: current.videoPath, lang: current.lang, asrModel, startSeconds, durationSeconds, requestId
          }) as YoutubeTranscriptionSegmentResult;
          if (!result.ok) throw new Error(result.error || (result.cancelled ? 'Cancelled' : 'Could not generate this segment'));
          return result.entries ?? [];
        } finally {
          signal.removeEventListener('abort', cancel);
        }
      },
      onState: (next) => { if (generation.current === run) setState(next); },
      onEntries: (entries) => {
        if (!valid()) return;
        const parsed = SubtitleContainer.createFromArrayEntries(new SubtitleContainer(), entries, current.lang, latest.current.forceSimplified);
        const key = (line) => `${line.timeStart}:${line.timeEnd}:${line.text}`;
        const previous = new Map(subtitle.lines.map((line) => [key(line), line]));
        const nextLines = parsed.lines.map((line) => previous.get(key(line)) ?? line);
        presentLines = new Set(nextLines);
        const removed = subtitle.lines.filter((line) => !presentLines.has(line));
        releaseLearningLines(removed, subtitle.frequency);
        subtitle.lines = nextLines;
        if (removed.length) latest.current.setFrequencyPrimary(new Map(subtitle.frequency));
        subtitle.notifyChanged();
        const unprocessed = subtitle.lines.filter((line) => typeof line.content === 'string' && !scheduled.has(line));
        unprocessed.forEach((line) => scheduled.add(line));
        if (!unprocessed.length) return;
        // Each batch analyses only new cues. Older tokens, frequency counts and glosses are reused.
        analysis = analysis.then(async () => {
          if (!valid()) return;
          const batch = new SubtitleContainer();
          batch.language = current.lang;
          batch.lines = unprocessed;
          batch.frequency = subtitle.frequency;
          const changed = () => {
            if (!valid()) return;
            subtitle.notifyChanged();
            latest.current.setFrequencyPrimary(new Map(subtitle.frequency));
          };
          const unsubscribe = batch.onChange(changed);
          try {
            await fillSubtitleWithLearningContent(batch, latest.current.tokenizeMiteiru, valid,
              () => Math.max(0, findLastLineStartingBy(batch.lines, latest.current.clock.get() * 1000)), (line) => presentLines.has(line));
          } finally {
            unsubscribe();
          }
        }).catch((error) => {
          if (valid()) setState((old) => ({...old, error: `Word analysis: ${error.message}`}));
        });
      }
    });
    scheduler.current = controller;
    const update = () => {
      const {clock, player} = latest.current;
      controller.update({positionSeconds: clock.get(), playing: player ? !player.paused() : false, durationSeconds: player?.duration(), previewing: clock.isPreviewing()});
    };
    const unsubscribe = current.clock.subscribe(update);
    current.player?.on('play', update);
    current.player?.on('pause', update);
    current.player?.on('durationchange', update);
    detach.current = () => {
      unsubscribe();
      current.player?.off('play', update);
      current.player?.off('pause', update);
      current.player?.off('durationchange', update);
    };
    update();
  }, [apiKey, asrModel, stop]);

  return {
    isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false), enabled, start, stop,
    retry: () => scheduler.current?.retry(), state, asrModel, setAsrModel, asrModelOptions: ASR_MODELS,
    hasApiKey: Boolean(apiKey.trim())
  };
}
