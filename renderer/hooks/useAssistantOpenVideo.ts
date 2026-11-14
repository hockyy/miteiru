import {useCallback, useEffect, useRef, useState} from 'react';
import type {LastVideo} from '../utils/continueWatching';
import type {TrackSelection} from '../components/Utils/MediaTrackSelectionModal';
import {getYoutubeVideoId} from '../utils/mediaUtils';
import {ASSISTANT_OPEN_VIDEO_EVENT} from './useAssistantWindow';

/** What an AI assistant asked to open (main/mcp/tools.ts, OpenVideoRequest). */
interface OpenVideoRequest {
  videoId: string;
  url: string;
  title: string;
  startAt: number;
  main: string | null;
  translation: string | null;
}

/** The video the page shows: each load makes a new one (useLoadFiles' videoSrc), even of the same link. */
interface VideoSource {
  path: string;
}

/** Captions that wait for their video to load, and the source showing when the request came. */
interface PendingCaptions {
  videoId: string;
  selection: TrackSelection;
  before: VideoSource;
  at: number;
}

// A load that never happened (a link the page refused) must not set captions on a later, unrelated load.
const PENDING_CAPTIONS_MS = 2 * 60_000;

/** The subtitle picker's own answer for the captions the assistant chose. */
const selectionFor = (request: OpenVideoRequest): TrackSelection => ({
  primarySubtitleTrackIndex: null,
  secondarySubtitleTrackIndex: null,
  primarySubtitleType: request.main ? 'youtube' : null,
  primaryYoutubeSubtitleLanguage: request.main ?? undefined,
  secondarySubtitleType: request.translation ? 'youtube' : null,
  secondaryYoutubeSubtitleLanguage: request.translation ?? undefined,
  preprocessOptions: {titleCaseAllCaps: true}
});

/**
 * Opens the video an AI assistant asked for, with the captions it chose. The request waits in the
 * backend (main/mcp/windowRequests.ts); this takes it once the language is ready, and again on each
 * nudge. The video opens first, and its captions load once the page shows that new load of it.
 */
export const useAssistantOpenVideo = ({ready, continueVideo, videoSource, handleMediaTrackSelection}: {
  ready: boolean;
  continueVideo: (last: LastVideo) => Promise<unknown> | unknown;
  videoSource: VideoSource;
  handleMediaTrackSelection: (selection: TrackSelection) => Promise<unknown> | unknown;
}) => {
  const [pending, setPending] = useState<PendingCaptions | null>(null);
  const continueVideoRef = useRef(continueVideo);
  continueVideoRef.current = continueVideo;
  const videoSourceRef = useRef(videoSource);
  videoSourceRef.current = videoSource;
  const unmounted = useRef(false);
  const taking = useRef(false);
  // A nudge that came while a take was still going: it may be about a newer request.
  const takeAgain = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; };
  }, []);

  const take = useCallback(async () => {
    if (taking.current) {
      takeAgain.current = true;
      return;
    }
    taking.current = true;
    try {
      do {
        takeAgain.current = false;
        const request = await window.backend.invoke('assistant:take-open-request') as OpenVideoRequest | null;
        if (unmounted.current) return;
        if (!request) continue;
        setPending({videoId: request.videoId, selection: selectionFor(request), before: videoSourceRef.current, at: Date.now()});
        void Promise.resolve(continueVideoRef.current({
          path: request.url,
          title: request.title,
          position: request.startAt,
          subtitles: {},
          savedAt: Date.now()
        })).catch((error) => console.error('[assistant] could not open the video:', error));
      } while (takeAgain.current);
    } catch (error) {
      console.error('[assistant] could not ask for the video to open:', error);
    } finally {
      taking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ready || !window.backend) return;
    void take();
    return window.backend.on(ASSISTANT_OPEN_VIDEO_EVENT, () => { void take(); });
  }, [ready, take]);

  // The captions belong to the new load of the video: loaded before it, the load would clear them.
  useEffect(() => {
    if (!pending || videoSource === pending.before || getYoutubeVideoId(videoSource.path) !== pending.videoId) return;
    setPending(null);
    if (Date.now() - pending.at > PENDING_CAPTIONS_MS) return;
    const {selection} = pending;
    if (!selection.primarySubtitleType && !selection.secondarySubtitleType) return;
    void handleMediaTrackSelection(selection);
  }, [pending, videoSource, handleMediaTrackSelection]);
};
