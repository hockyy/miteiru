import {useCallback} from "react";
import {SubtitlePreprocessOptions} from "../types/subtitlePreprocess";
import {getYoutubeVideoId, SubtitleTarget} from "../utils/mediaUtils";

interface UseMediaTrackSubtitleSelectionParams {
  videoPath: string;
  handleTrackSelection: (selection: any, loadSubtitle: LoadEmbeddedSubtitle) => Promise<unknown> | unknown;
  handleCloseTrackSelectionModal: () => void;
  loadEmbeddedSubtitle: LoadEmbeddedSubtitle;
  setToastInfo: (info: { message: string; update: string }) => void;
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
  setToastInfo
}: UseMediaTrackSubtitleSelectionParams) => {
  const showToast = useCallback((message: string) => {
    setToastInfo({
      message,
      update: Math.random().toString()
    });
  }, [setToastInfo]);

  const downloadYoutubeSubtitle = useCallback(async (
    videoId: string,
    target: SubtitleTarget,
    language: string,
    preprocessOptions?: SubtitlePreprocessOptions
  ) => {
    console.log(`[Video] Downloading YouTube ${target} subtitle: ${language}`);
    showToast(`Downloading ${target} YouTube subtitle (${language})...`);

    try {
      const result = await window.ipc.invoke("downloadYoutubeSubtitle", videoId, language);
      if (!result.success || !result.filePath) {
        throw new Error(result.error || 'Download failed');
      }

      console.log(`[Video] ${target} subtitle downloaded to: ${result.filePath}`);
      await loadEmbeddedSubtitle(result.filePath, target, preprocessOptions);
      showToast(`${target === 'primary' ? 'Primary' : 'Secondary'} YouTube subtitle loaded (${language})`);
    } catch (error) {
      console.error(`Failed to download YouTube ${target} subtitle:`, error);
      showToast(`Failed to load ${target} YouTube subtitle: ${error.message}`);
    }
  }, [loadEmbeddedSubtitle, showToast]);

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
            videoId,
            'primary',
            selection.primaryYoutubeSubtitleLanguage,
            selection.preprocessOptions
          ));
        }

        if (selection.secondarySubtitleType === 'youtube' && selection.secondaryYoutubeSubtitleLanguage) {
          downloadPromises.push(downloadYoutubeSubtitle(
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
      showToast(`Failed to load selected tracks: ${error.message}`);
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
