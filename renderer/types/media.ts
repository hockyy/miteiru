export interface MediaTrack {
  index: number;
  type: 'audio' | 'video' | 'subtitle';
  codec: string;
  language?: string;
  title?: string;
  default?: boolean;
  tempFilePath?: string; // For extracted subtitle files
}

export interface MediaInfo {
  duration: number;
  audioTracks: MediaTrack[];
  subtitleTracks: MediaTrack[];
  videoTracks: MediaTrack[];
  error?: string;
  toolsAvailable?: boolean;
}
