import {useCallback, useRef} from "react";
import {SubtitlePreprocessOptions} from "../types/subtitlePreprocess";
import {getYoutubeVideoId, SubtitleTarget} from "../utils/mediaUtils";
import {mainSubtitleName, TRANSLATION_NAME} from "../utils/subtitleLabels";

interface UseMediaTrackSubtitleSelectionParams {
  videoPath: string;
  handleTrackSelection: (selection: any, loadSubtitle: LoadEmbeddedSubtitle) => Promise<unknown> | unknown;
  handleCloseTrackSelectionModal: () => void;
  loadEmbeddedSubtitle: LoadEmbeddedSubtitle;
  setToastInfo: (info: { message: string; update: string }) => void;
  /** The language being learned by name ("Japanese"): the main subtitle is called after it. */
  languageName?: string;
}

type LoadEmbeddedSubtitle = (
  filePath: string,
  type: SubtitleTarget,
  preprocessOptions?: SubtitlePreprocessOptions
) => void | Promise<void>;

const hasYoutubeSubtitleSelection = (selection: any) => (
  selection.primarySubtitleType === 'youtube' || selection.secondarySubtitleType === 'youtube'
);

const hasEmbeddedSubtitleSelection = (selection: any) => (
  selection.primarySubtitleType === 'embedded' || selection.secondarySubtitleType === 'embedded'
);

const hasNoSubtitleSelection = (selection: any) => (
  !selection.primarySubtitleType && !selection.secondarySubtitleType
);

export const useMediaTrackSubtitleSelection = ({
  videoPath,
  handleTrackSelection,
  handleCloseTrackSelectionModal,
  loadEmbeddedSubtitle,
  setToastInfo,
  languageName
}: UseMediaTrackSubtitleSelectionParams) => {
  const showToast = useCallback((message: string) => {
    setToastInfo({
      message,
      update: Math.random().toString()
    });
  }, [setToastInfo]);

  // The video open now, read after a download to see whether the learner moved on meanwhile.
  const openVideoPath = useRef(videoPath);
  openVideoPath.current = videoPath;

  const downloadYoutubeSubtitle = useCallback(async (
    forVideoPath: string,
    videoId: string,
    target: SubtitleTarget,
    language: string,
    preprocessOptions?: SubtitlePreprocessOptions
  ) => {
    console.log(`[Video] Downloading YouTube ${target} subtitle: ${language}`);
    // "the Japanese subtitles" or "the translation": the loader's own toast says it is loaded.
    const name = target === 'primary' ? `the ${mainSubtitleName(languageName)}` : `the ${TRANSLATION_NAME.toLowerCase()}`;
    showToast(`Getting ${name} from YouTube…`);

    try {
      const result = await window.backend.invoke("downloadYoutubeSubtitle", videoId, language);
      if (!result.success || !result.filePath) {
        throw new Error(result.error || 'Download failed');
      }

      console.log(`[Video] ${target} subtitle downloaded to: ${result.filePath}`);
      // These captions are for the video they were chosen on, not the one opened since.
      if (openVideoPath.current !== forVideoPath) return;
      await loadEmbeddedSubtitle(result.filePath, target, preprocessOptions);
    } catch (error) {
      console.error(`Failed to download YouTube ${target} subtitle:`, error);
      showToast(`Couldn't get ${name} from YouTube: ${error.message}`);
    }
  }, [loadEmbeddedSubtitle, showToast, languageName]);

  return useCallback(async (selection) => {
    console.log('[Video] Handling media track selection:', selection);
    handleCloseTrackSelectionModal();

    try {
      if (hasYoutubeSubtitleSelection(selection)) {
        const videoId = getYoutubeVideoId(videoPath);
        if (!videoId) throw new Error('Invalid YouTube URL');

        const downloadPromises = [];
        if (selection.primarySubtitleType === 'youtube' && selection.primaryYoutubeSubtitleLanguage) {
          downloadPromises.push(downloadYoutubeSubtitle(
            videoPath,
            videoId,
            'primary',
            selection.primaryYoutubeSubtitleLanguage,
            selection.preprocessOptions
          ));
        }

        if (selection.secondarySubtitleType === 'youtube' && selection.secondaryYoutubeSubtitleLanguage) {
          downloadPromises.push(downloadYoutubeSubtitle(
            videoPath,
            videoId,
            'secondary',
            selection.secondaryYoutubeSubtitleLanguage,
            selection.preprocessOptions
          ));
        }

        await Promise.all(downloadPromises);
      }

      if (hasEmbeddedSubtitleSelection(selection)) {
        await handleTrackSelection(selection, loadEmbeddedSubtitle);
      }

      if (hasNoSubtitleSelection(selection)) {
        showToast('No subtitles selected');
      }
    } catch (error) {
      console.error('Error handling media track selection:', error);
      showToast(`Couldn't load the subtitles you chose: ${error.message}`);
    }
  }, [
    downloadYoutubeSubtitle,
    handleCloseTrackSelectionModal,
    handleTrackSelection,
    loadEmbeddedSubtitle,
    showToast,
    videoPath
  ]);
};
