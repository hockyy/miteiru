import type {YoutubeTranscriptionState} from './youtubeTranscription';
import {formatClock} from './aiFormat';

export type TranscriptionStatus = {kind: 'error' | 'making' | 'ready' | 'off'; text: string; pieces: string};

/** The status card of "Subtitles from the audio": what is being made, how far it is ready, or why it stopped. */
export const transcriptionStatus = (state: YoutubeTranscriptionState, enabled: boolean): TranscriptionStatus => {
  const pieces = state.completedSegments > 0
    ? `${state.completedSegments} ${state.completedSegments === 1 ? 'piece' : 'pieces'} made` : '';
  if (state.error) return {kind: 'error', text: state.error, pieces};
  if (!enabled) return {kind: 'off', text: 'Off. Start whenever you want subtitles made from the audio.', pieces};
  if (state.activeSegment) {
    const {bucketStartSeconds, bucketEndSeconds} = state.activeSegment;
    return {kind: 'making', text: `Making ${formatClock(bucketStartSeconds)}–${formatClock(Math.ceil(bucketEndSeconds))}…`, pieces};
  }
  return {kind: 'ready', text: `Ready up to ${formatClock(state.bufferedUntilSeconds)}`, pieces};
};
