import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Subtitles, Play, Download, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { MediaTrack } from '../../types/media';
import { useYoutubeSubtitles } from '../../hooks/useYoutubeSubtitles';
import { SubtitlePreprocessOptions } from '../../types/subtitlePreprocess';
import {getLanguageEmoji, pickDefaultSubtitleTracks, SubtitleCandidate} from "../../utils/mediaUtils";
import {
  ALL_CAPS_OPTION_HINT,
  ALL_CAPS_OPTION_LABEL,
  describeEmbeddedTrack,
  describeYoutubeCaption,
  mainSubtitleName,
  PICTURE_SUBTITLE_NOTE,
  pickerFooterText,
  type PickedSubtitle,
  TRANSLATION_NAME
} from "../../utils/subtitleLabels";
import {isMissingYtDlpError, YT_DLP_NEEDED, ytDlpSetupSteps} from "../../utils/toolSetup";
import {ModalShell} from "./ModalShell";

interface MediaTrackSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: TrackSelection) => void;
  fileName: string;
  subtitleTracks: MediaTrack[];
  currentAppLanguage: string;
  appLanguageCode: string; // e.g. zh-CN, used to preselect the tracks
  videoUrl?: string; // YouTube URL for fetching online subtitles
  /** Closes this and opens the file picker, for a subtitle file the learner already has. */
  onOpenSubtitleFile?: () => void;
}

export interface TrackSelection {
  primarySubtitleTrackIndex: number | null; // null means no primary subtitle
  secondarySubtitleTrackIndex: number | null; // null means no secondary subtitle
  primarySubtitleType: 'embedded' | 'youtube' | null; // null when no primary subtitle
  secondarySubtitleType: 'embedded' | 'youtube' | null; // null when no secondary subtitle
  primaryYoutubeSubtitleLanguage?: string;
  secondaryYoutubeSubtitleLanguage?: string;
  preprocessOptions?: SubtitlePreprocessOptions;
}

type SubtitleSource = 'embedded' | 'youtube';
type Slot = 'primary' | 'secondary';

const ROW = "flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer";

/** YouTube captions need yt-dlp: why, what to do on this OS, and the buttons to do it. */
const YtDlpSetup = ({onCheckAgain, checking}: { onCheckAgain: () => void; checking: boolean }) => {
  const platform = typeof window === 'undefined' ? '' : window.electronAPI?.platform ?? '';
  return (
    <div className="rounded-lg border border-yellow-300/30 bg-yellow-950/30 p-4 text-sm text-white/90">
      <div className="mb-2 font-semibold">{YT_DLP_NEEDED}</div>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-white/75">
        {ytDlpSetupSteps(platform).map((step) => <li key={step}>{step}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="secondary" size="small" onPress={() => { window.electronAPI.openToolsFolder?.(); }}>
          Open tools folder
        </Button>
        <Button type="secondary" size="small" disabled={checking} onPress={onCheckAgain}>
          {checking ? 'Checking…' : 'Check again'}
        </Button>
      </div>
    </div>
  );
};

const MediaTrackSelectionModal: React.FC<MediaTrackSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  subtitleTracks,
  currentAppLanguage,
  appLanguageCode,
  videoUrl,
  onOpenSubtitleFile
}) => {
  const [selectedPrimarySubtitle, setSelectedPrimarySubtitle] = useState<number | null>(null);
  const [selectedSecondarySubtitle, setSelectedSecondarySubtitle] = useState<number | null>(null);
  const [selectedPrimaryType, setSelectedPrimaryType] = useState<SubtitleSource | null>(null);
  const [selectedSecondaryType, setSelectedSecondaryType] = useState<SubtitleSource | null>(null);
  const [preprocessOptions, setPreprocessOptions] = useState<SubtitlePreprocessOptions>({
    titleCaseAllCaps: true
  });
  const [checkingTools, setCheckingTools] = useState(false);

  // Use YouTube subtitles hook
  const {
    subtitles: youtubeSubtitles,
    isLoading: isLoadingYoutube,
    hasLoaded: hasLoadedYoutube,
    error: youtubeError,
    isYoutubeUrl,
    fetchAvailableSubtitles,
    clearSubtitles
  } = useYoutubeSubtitles();

  const isYouTubeUrl = Boolean(videoUrl && isYoutubeUrl(videoUrl));
  // Once the user picks a track, the defaults stop overriding their choice.
  const userPickedRef = useRef(false);

  // Picture subtitles (Blu-ray, DVD) have no text to read: listed, but not usable.
  const described = useMemo(
    () => subtitleTracks.map((track, index) => describeEmbeddedTrack(track, index)),
    [subtitleTracks]
  );

  // Fetch YouTube subtitles when modal opens for YouTube videos
  useEffect(() => {
    if (!isOpen) {
      clearSubtitles();
      setPreprocessOptions({
        titleCaseAllCaps: true
      });
      userPickedRef.current = false;
      setSelectedPrimarySubtitle(null);
      setSelectedPrimaryType(null);
      setSelectedSecondarySubtitle(null);
      setSelectedSecondaryType(null);
      return;
    }

    if (isYouTubeUrl && videoUrl) {
      fetchAvailableSubtitles(videoUrl);
    }
  }, [isOpen, isYouTubeUrl, videoUrl, fetchAvailableSubtitles, clearSubtitles]);

  // Preselect the learning language on top and English underneath; YouTube tracks arrive after the modal opens.
  // Picture subtitles are never preselected.
  useEffect(() => {
    if (!isOpen || userPickedRef.current) return;

    const candidates: SubtitleCandidate[] = [
      ...subtitleTracks.map((track, index): SubtitleCandidate => ({
        type: 'embedded', index, language: track.language, unusable: described[index].picture
      })),
      ...(isYouTubeUrl
        ? youtubeSubtitles.map((subtitle, index): SubtitleCandidate => ({type: 'youtube', index, language: subtitle.language}))
        : [])
    ];
    const { primary, secondary } = pickDefaultSubtitleTracks(candidates, appLanguageCode);
    setSelectedPrimarySubtitle(primary?.index ?? null);
    setSelectedPrimaryType(primary?.type ?? null);
    setSelectedSecondarySubtitle(secondary?.index ?? null);
    setSelectedSecondaryType(secondary?.type ?? null);
  }, [isOpen, isYouTubeUrl, subtitleTracks, described, youtubeSubtitles, appLanguageCode]);

  const handleChange = useCallback((slot: Slot, index: number | null, type: SubtitleSource | null) => {
    userPickedRef.current = true;
    if (slot === 'primary') {
      setSelectedPrimarySubtitle(index);
      setSelectedPrimaryType(type);
    } else {
      setSelectedSecondarySubtitle(index);
      setSelectedSecondaryType(type);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    const selection: TrackSelection = {
      primarySubtitleTrackIndex: selectedPrimarySubtitle,
      secondarySubtitleTrackIndex: selectedSecondarySubtitle,
      primarySubtitleType: selectedPrimaryType,
      secondarySubtitleType: selectedSecondaryType,
      primaryYoutubeSubtitleLanguage: selectedPrimaryType === 'youtube' && selectedPrimarySubtitle !== null
        ? youtubeSubtitles[selectedPrimarySubtitle]?.language
        : undefined,
      secondaryYoutubeSubtitleLanguage: selectedSecondaryType === 'youtube' && selectedSecondarySubtitle !== null
        ? youtubeSubtitles[selectedSecondarySubtitle]?.language
        : undefined,
      preprocessOptions
    };
    onConfirm(selection);
  }, [
    onConfirm,
    preprocessOptions,
    selectedPrimarySubtitle,
    selectedPrimaryType,
    selectedSecondarySubtitle,
    selectedSecondaryType,
    youtubeSubtitles
  ]);

  const toPicked = useCallback((index: number | null, type: SubtitleSource | null): PickedSubtitle | null => {
    if (index === null || type === null) return null;
    if (type === 'youtube') {
      const caption = youtubeSubtitles[index];
      return caption ? {source: 'youtube', language: caption.language, autoGenerated: caption.isAutoGenerated, position: index} : null;
    }
    const track = subtitleTracks[index];
    return track ? {source: 'embedded', language: track.language, title: track.title, position: index} : null;
  }, [subtitleTracks, youtubeSubtitles]);

  const footerSummary = useMemo(() => pickerFooterText(
    toPicked(selectedPrimarySubtitle, selectedPrimaryType),
    toPicked(selectedSecondarySubtitle, selectedSecondaryType)
  ), [toPicked, selectedPrimarySubtitle, selectedPrimaryType, selectedSecondarySubtitle, selectedSecondaryType]);

  // Re-runs the tool check (the learner just added yt-dlp), then asks YouTube for the captions again.
  const checkAgain = useCallback(async () => {
    setCheckingTools(true);
    try {
      await window.backend.invoke('checkMediaTools', true);
    } catch (error) {
      console.error('[MediaTrackSelectionModal] tool check failed', error);
    } finally {
      setCheckingTools(false);
    }
    if (videoUrl) fetchAvailableSubtitles(videoUrl);
  }, [videoUrl, fetchAvailableSubtitles]);

  if (!isOpen) return null;

  const loadingCaptions = isYouTubeUrl && isLoadingYoutube;
  const ytDlpMissing = isYouTubeUrl && isMissingYtDlpError(youtubeError);
  const noCaptions = isYouTubeUrl && hasLoadedYoutube && !isLoadingYoutube && !youtubeError && youtubeSubtitles.length === 0;

  const renderList = (slot: Slot) => {
    const selectedIndex = slot === 'primary' ? selectedPrimarySubtitle : selectedSecondarySubtitle;
    const selectedType = slot === 'primary' ? selectedPrimaryType : selectedSecondaryType;
    const group = `${slot}Subtitle`;
    const accent = slot === 'primary' ? 'text-green-600' : 'text-yellow-600';
    return (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        <label className={ROW}>
          <input
            type="radio"
            name={group}
            checked={selectedIndex === null}
            onChange={() => handleChange(slot, null, null)}
            className={`w-4 h-4 ${accent} bg-gray-600 border-gray-500`}
          />
          <span className="text-gray-300 text-sm">None</span>
        </label>

        {subtitleTracks.length > 0 && (
          <>
            <div className="text-gray-400 text-xs font-medium px-2 py-1">
              Inside this video
            </div>
            {subtitleTracks.map((track, index) => {
              const {label, picture} = described[index];
              return (
                <label key={`${slot}-embedded-${track.index}`}
                       className={`${ROW} ${picture ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''}`}>
                  <input
                    type="radio"
                    name={group}
                    disabled={picture}
                    checked={selectedIndex === index && selectedType === 'embedded'}
                    onChange={() => handleChange(slot, index, 'embedded')}
                    className={`w-4 h-4 ${accent} bg-gray-600 border-gray-500`}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getLanguageEmoji(track.language)}
                    <span className="text-white text-sm truncate">{label}</span>
                    {picture && <span className="text-gray-300 text-xs">{PICTURE_SUBTITLE_NOTE}</span>}
                  </div>
                </label>
              );
            })}
          </>
        )}

        {isYouTubeUrl && youtubeSubtitles.length > 0 && (
          <>
            <div className="text-gray-400 text-xs font-medium px-2 py-1 flex items-center gap-1">
              <Download className="w-3 h-3" />
              From YouTube
            </div>
            {youtubeSubtitles.map((subtitle, index) => (
              <label key={`${slot}-youtube-${index}`} className={ROW}>
                <input
                  type="radio"
                  name={group}
                  checked={selectedIndex === index && selectedType === 'youtube'}
                  onChange={() => handleChange(slot, index, 'youtube')}
                  className={`w-4 h-4 ${accent} bg-gray-600 border-gray-500`}
                />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getLanguageEmoji(subtitle.language)}
                  <span className="text-white text-sm truncate">{describeYoutubeCaption(subtitle)}</span>
                </div>
              </label>
            ))}
          </>
        )}

        {slot === 'primary' && loadingCaptions && (
          <div className="flex items-center justify-center p-4 text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading captions…</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <ModalShell
      title="Choose subtitles"
      icon={<Subtitles className="h-5 w-5 text-green-300" />}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      minSizeClassName="min-h-[560px] min-w-[min(94vw,36rem)]"
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-1">
            <div className="text-sm text-white/70">{footerSummary}</div>
            {onOpenSubtitleFile && (
              <Button type="link" size="small" onPress={onOpenSubtitleFile}>
                Open a subtitle file instead…
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="secondary" onPress={onClose}>
              Cancel
            </Button>
            <Button type="primary" disabled={loadingCaptions} onPress={handleConfirm}>
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                {loadingCaptions ? 'Loading captions…' : 'Load subtitles'}
              </div>
            </Button>
          </div>
        </div>
      )}
    >
          {/* File Info */}
          <div className="text-center mb-6">
            <div className="text-gray-300 text-sm mb-1">Subtitles for</div>
            <div className="text-white font-medium break-words mb-2">
              {fileName}
            </div>
            <div className="text-gray-400 text-xs">
              Learning: {getLanguageEmoji(currentAppLanguage)} {currentAppLanguage}
              {subtitleTracks.length > 0 && ` • ${subtitleTracks.length} inside the video`}
              {isYouTubeUrl && !loadingCaptions && !youtubeError && ` • ${youtubeSubtitles.length} on YouTube`}
            </div>
          </div>

          {ytDlpMissing && (
            <div className="mb-4">
              <YtDlpSetup onCheckAgain={checkAgain} checking={checkingTools} />
            </div>
          )}

          {isYouTubeUrl && youtubeError && !ytDlpMissing && (
            <div className="mb-4 rounded-lg border border-red-300/30 bg-red-950/30 p-4 text-sm text-white/90">
              <div className="mb-2 font-semibold">Couldn&rsquo;t load the YouTube captions.</div>
              <details className="mb-3 text-xs text-white/60">
                <summary className="cursor-pointer">Details</summary>
                <div className="mt-1 break-words">{youtubeError}</div>
              </details>
              <Button type="secondary" size="small" onPress={checkAgain} disabled={checkingTools}>
                {checkingTools ? 'Checking…' : 'Try again'}
              </Button>
            </div>
          )}

          {noCaptions && (
            <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-gray-300">
              This video has no captions on YouTube.
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-4">
            <div className="text-gray-300 text-sm font-medium mb-2">
              Options
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!preprocessOptions.titleCaseAllCaps}
                onChange={(event) => setPreprocessOptions({
                  ...preprocessOptions,
                  titleCaseAllCaps: event.target.checked
                })}
                className="mt-0.5 w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded"
              />
              <span className="text-gray-300 text-sm">
                {ALL_CAPS_OPTION_LABEL}
                <span className="block text-xs text-gray-400">{ALL_CAPS_OPTION_HINT}</span>
              </span>
            </label>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <Subtitles className="w-5 h-5 text-green-400" />
                <h3 className="text-white font-medium">{mainSubtitleName(currentAppLanguage)}</h3>
                <span className="text-gray-400 text-sm">
                  (the language you are learning)
                </span>
              </div>
              {renderList('primary')}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <Subtitles className="w-5 h-5 text-yellow-400" />
                <h3 className="text-white font-medium">{TRANSLATION_NAME}</h3>
                <span className="text-gray-400 text-sm">
                  (to read along, usually English)
                </span>
              </div>
              {renderList('secondary')}
            </div>
          </div>
    </ModalShell>
  );
};

export default MediaTrackSelectionModal;
