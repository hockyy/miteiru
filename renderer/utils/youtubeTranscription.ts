import type {SubtitleEntry} from "../../main/helpers/subtitleParser";

export const YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS = 30;
export const YOUTUBE_TRANSCRIPTION_OVERLAP_SECONDS = 2;
export const YOUTUBE_TRANSCRIPTION_LOOKAHEAD_SEGMENTS = 2;

export interface YoutubeTranscriptionSegment {
  index: number;
  /** Audio includes context either side of the display bucket. */
  startSeconds: number;
  durationSeconds: number;
  bucketStartSeconds: number;
  bucketEndSeconds: number;
}

export interface YoutubeTranscriptionPosition {
  positionSeconds: number;
  playing: boolean;
  durationSeconds?: number;
  previewing?: boolean;
}

export interface YoutubeTranscriptionRequest extends YoutubeTranscriptionSegment {
  videoId: string;
  signal: AbortSignal;
}

export interface YoutubeTranscriptionState {
  activeSegment: YoutubeTranscriptionSegment | null;
  completedSegments: number;
  bufferedUntilSeconds: number;
  error: string | null;
}

export interface YoutubeTranscriptionSchedulerOptions {
  videoId: string;
  /** Entries already use the video's absolute millisecond timestamps. */
  requestSegment: (request: YoutubeTranscriptionRequest) => Promise<SubtitleEntry[]>;
  onEntries: (entries: SubtitleEntry[]) => void;
  onError?: (error: Error, segment: YoutubeTranscriptionSegment) => void;
  onState?: (state: YoutubeTranscriptionState) => void;
}

const positionSeconds = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const durationSeconds = (value?: number) => value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;

/** A bounded window near playback, never the whole video; a pause only prepares its current bucket. */
export const youtubeTranscriptionWindow = (position: YoutubeTranscriptionPosition): YoutubeTranscriptionSegment[] => {
  if (position.previewing) return [];
  const seconds = positionSeconds(position.positionSeconds);
  const duration = durationSeconds(position.durationSeconds);
  if (duration !== undefined && seconds >= duration) return [];
  const first = Math.floor(seconds / YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS);
  const count = position.playing ? YOUTUBE_TRANSCRIPTION_LOOKAHEAD_SEGMENTS + 1 : 1;
  const segments: YoutubeTranscriptionSegment[] = [];
  for (let index = first; index < first + count; index++) {
    const bucketStartSeconds = index * YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS;
    if (duration !== undefined && bucketStartSeconds >= duration) break;
    const bucketEndSeconds = Math.min(bucketStartSeconds + YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS, duration ?? Infinity);
    const startSeconds = Math.max(0, bucketStartSeconds - YOUTUBE_TRANSCRIPTION_OVERLAP_SECONDS);
    const endSeconds = Math.min(bucketEndSeconds + YOUTUBE_TRANSCRIPTION_OVERLAP_SECONDS, duration ?? Infinity);
    segments.push({index, startSeconds, durationSeconds: endSeconds - startSeconds, bucketStartSeconds, bucketEndSeconds});
  }
  return segments;
};

/** Each cue belongs to one display bucket, even though neighbouring audio requests overlap. */
export const entriesForYoutubeTranscriptionSegment = (
  entries: readonly SubtitleEntry[],
  segment: YoutubeTranscriptionSegment
): SubtitleEntry[] => entries.filter((entry) => {
  if (!Number.isFinite(entry.from) || !Number.isFinite(entry.to) || entry.to <= entry.from || !entry.text.trim()) return false;
  const midpoint = (entry.from + entry.to) / 2;
  return midpoint >= segment.bucketStartSeconds * 1000 && midpoint < segment.bucketEndSeconds * 1000;
}).map((entry, index) => ({
  ...entry,
  id: `youtube-${segment.index}-${entry.id || index}`,
  from: Math.max(0, entry.from),
  to: Math.min(entry.to, (segment.startSeconds + segment.durationSeconds) * 1000)
})).filter((entry) => entry.to > entry.from);

const normalizedText = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]+/gu, "");

/** Merge out-of-order segment replies, removing the same utterance recognised across an overlap. */
export const mergeYoutubeTranscriptEntries = (groups: readonly (readonly SubtitleEntry[])[]): SubtitleEntry[] => {
  const sorted = groups.flat().filter((entry) => Number.isFinite(entry.from) && Number.isFinite(entry.to) && entry.to > entry.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: SubtitleEntry[] = [];
  const byText = new Map<string, SubtitleEntry[]>();
  for (const entry of sorted) {
    const text = normalizedText(entry.text);
    const candidates = (byText.get(text) ?? []).filter((previous) => previous.to > entry.from);
    let duplicate: SubtitleEntry | undefined;
    for (let index = candidates.length - 1; index >= 0; index--) {
      const previous = candidates[index];
      const overlap = Math.min(previous.to, entry.to) - Math.max(previous.from, entry.from);
      if (overlap >= Math.min(previous.to - previous.from, entry.to - entry.from) / 2) {
        duplicate = previous;
        break;
      }
    }
    if (duplicate) {
      duplicate.from = Math.min(duplicate.from, entry.from);
      duplicate.to = Math.max(duplicate.to, entry.to);
    } else {
      const cue = {...entry};
      merged.push(cue);
      candidates.push(cue);
    }
    byText.set(text, candidates);
  }
  return merged;
};

/** One paid request at a time, retargeted by playback; dispose before switching video or language. */
export class YoutubeTranscriptionScheduler {
  private position: YoutubeTranscriptionPosition = {positionSeconds: 0, playing: false};
  private readonly completed = new Map<number, SubtitleEntry[]>();
  private active: {segment: YoutubeTranscriptionSegment; controller: AbortController; generation: number} | null = null;
  private generation = 0;
  private disposed = false;
  private failure: string | null = null;
  private work: Promise<void> | null = null;

  constructor(private readonly options: YoutubeTranscriptionSchedulerOptions) {}

  update(position: YoutubeTranscriptionPosition) {
    if (this.disposed) return;
    const previous = this.position;
    this.position = {
      positionSeconds: positionSeconds(position.positionSeconds),
      playing: position.playing,
      durationSeconds: durationSeconds(position.durationSeconds),
      previewing: position.previewing
    };
    const wanted = youtubeTranscriptionWindow(this.position);
    if (this.active && !this.active.controller.signal.aborted && !wanted.some((segment) => segment.index === this.active!.segment.index)) {
      this.generation++;
      this.active.controller.abort();
    }
    if (Math.floor(previous.positionSeconds / YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS) !== Math.floor(this.position.positionSeconds / YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS)
      || previous.playing !== this.position.playing || previous.durationSeconds !== this.position.durationSeconds) this.publishState();
    this.start();
  }

  /** An error never starts an automatic paid retry loop. The caller explicitly retries/resumes. */
  retry() {
    if (this.disposed) return;
    this.failure = null;
    this.publishState();
    this.start();
  }

  /** Reapply presentation changes to cached cues without extracting or transcribing audio again. */
  refreshEntries() {
    if (!this.disposed && this.completed.size) this.options.onEntries(mergeYoutubeTranscriptEntries([...this.completed.values()]));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.active?.controller.abort();
    this.completed.clear();
  }

  async whenIdle() {
    while (this.work) await this.work;
  }

  private nextSegment() {
    return youtubeTranscriptionWindow(this.position).find((segment) => !this.completed.has(segment.index));
  }

  private publishState() {
    if (this.disposed) return;
    let index = Math.floor(this.position.positionSeconds / YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS);
    let bufferedUntilSeconds = this.position.positionSeconds;
    while (this.completed.has(index)) {
      bufferedUntilSeconds = Math.min((index + 1) * YOUTUBE_TRANSCRIPTION_SEGMENT_SECONDS, this.position.durationSeconds ?? Infinity);
      index++;
    }
    this.options.onState?.({
      activeSegment: this.active?.segment ?? null,
      completedSegments: this.completed.size,
      bufferedUntilSeconds,
      error: this.failure
    });
  }

  private start() {
    if (this.work || this.disposed || this.failure || !this.nextSegment()) return;
    this.work = Promise.resolve().then(() => this.drain()).finally(() => {
      this.work = null;
      // update()/retry() may have changed the window while the previous promise was settling.
      this.start();
    });
  }

  private async drain() {
    while (!this.disposed && !this.failure) {
      const segment = this.nextSegment();
      if (!segment) return;
      const controller = new AbortController();
      const generation = this.generation;
      this.active = {segment, controller, generation};
      this.publishState();
      try {
        const entries = await this.options.requestSegment({...segment, videoId: this.options.videoId, signal: controller.signal});
        if (this.disposed) return;
        if (generation !== this.generation || controller.signal.aborted) continue;
        this.completed.set(segment.index, entriesForYoutubeTranscriptionSegment(entries, segment));
        this.options.onEntries(mergeYoutubeTranscriptEntries([...this.completed.values()]));
      } catch (error) {
        if (this.disposed) return;
        if (generation !== this.generation || controller.signal.aborted) continue;
        const failure = error instanceof Error ? error : new Error(String(error));
        this.failure = failure.message || "Could not transcribe this audio segment.";
        this.options.onError?.(failure, segment);
      } finally {
        this.active = null;
        this.publishState();
      }
    }
  }
}
