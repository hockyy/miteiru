import type {SubtitleEntry} from '../../main/helpers/subtitleParser';

export type YoutubeTranscriptionSegmentRequest = {
  videoPath: string;
  lang: string;
  asrModel: string;
  startSeconds: number;
  durationSeconds: number;
  requestId: string;
};

export type YoutubeTranscriptionSegmentResult = {
  ok: boolean;
  /** Cue times on the video's timeline, in milliseconds. */
  entries?: SubtitleEntry[];
  error?: string;
  cancelled?: boolean;
  cached?: boolean;
};
