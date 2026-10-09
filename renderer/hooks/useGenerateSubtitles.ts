import {useCallback, useEffect, useState} from "react";
import {useStoreData} from "./useStoreData";
import {
  ASR_MODELS,
  DEFAULT_ASR_MODEL,
  DEFAULT_TRANSLATE_MODEL,
  isKnownAsrModel,
  TRANSLATE_MODELS
} from "../utils/generateSubtitlesConfig";
import {openRouterMessages} from "../utils/openRouterConstants";
import type {
  GenerateSubtitlesProgress,
  GenerateSubtitlesResult
} from "../types/generateSubtitles";
import {isYoutube} from "../utils/utils";

const idleProgress: GenerateSubtitlesProgress = {
  stage: "idle",
  message: ""
};

const busyStages = new Set(["converting", "transcribing", "saving", "translating"]);

type LoadEmbeddedSubtitle = (filePath: string, type: "primary" | "secondary") => Promise<void> | void;

export function useGenerateSubtitles({
  videoPath,
  lang,
  loadEmbeddedSubtitle
}: {
  videoPath: string;
  lang: string;
  loadEmbeddedSubtitle: LoadEmbeddedSubtitle;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<GenerateSubtitlesProgress>(idleProgress);
  const [sourceSrtPath, setSourceSrtPath] = useState("");
  const [englishSrtPath, setEnglishSrtPath] = useState("");
  const [asrModel, setAsrModel] = useStoreData("subtitles.asrModel", DEFAULT_ASR_MODEL);
  const [translateModel, setTranslateModel] = useStoreData("subtitles.translateModel", DEFAULT_TRANSLATE_MODEL);
  const [apiKey] = useStoreData("openrouter.apiKey", "");

  const isBusy = busyStages.has(progress.stage);
  const hasApiKey = Boolean(String(apiKey || "").trim());
  const hasVideo = Boolean(videoPath);
  const sourceKind = videoPath && isYoutube(videoPath) ? "youtube" : "local";
  const resolvedAsrModel = isKnownAsrModel(asrModel) ? asrModel : DEFAULT_ASR_MODEL;
  const resolvedTranslateModel = translateModel || DEFAULT_TRANSLATE_MODEL;

  useEffect(() => {
    setProgress(idleProgress);
    setSourceSrtPath("");
    setEnglishSrtPath("");
  }, [videoPath]);

  useEffect(() => {
    return window.electronAPI.generateSubtitles.onProgress((next) => {
      setProgress(next);
      if (next.sourceSrtPath) {
        setSourceSrtPath(next.sourceSrtPath);
      }
      if (next.englishSrtPath) {
        setEnglishSrtPath(next.englishSrtPath);
      }
    });
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const cancel = useCallback(async () => {
    await window.electronAPI.generateSubtitles.cancel();
  }, []);

  const close = useCallback(async () => {
    if (isBusy) {
      await cancel();
    }
    setIsOpen(false);
    if (progress.stage === "error" || progress.stage === "cancelled") {
      setProgress((current) => sourceSrtPath
        ? {...current, stage: "done", message: current.message, error: undefined}
        : idleProgress);
    }
  }, [cancel, isBusy, progress.stage, sourceSrtPath]);

  const applyResult = useCallback(async (result: GenerateSubtitlesResult, loadEnglish: boolean) => {
    if (result.cancelled) {
      setProgress({stage: "cancelled", message: "Cancelled"});
      return;
    }
    if (!result.ok) {
      setProgress({
        stage: "error",
        message: result.error || "Failed",
        error: result.error,
        sourceSrtPath: result.sourceSrtPath || sourceSrtPath
      });
      return;
    }
    if (result.sourceSrtPath) {
      setSourceSrtPath(result.sourceSrtPath);
      await loadEmbeddedSubtitle(result.sourceSrtPath, "primary");
    }
    if (loadEnglish && result.englishSrtPath) {
      setEnglishSrtPath(result.englishSrtPath);
      await loadEmbeddedSubtitle(result.englishSrtPath, "secondary");
    }
  }, [loadEmbeddedSubtitle, sourceSrtPath]);

  const generate = useCallback(async () => {
    if (!hasVideo) {
      setProgress({stage: "error", message: "Load a video first", error: "Load a video first"});
      return;
    }
    if (!hasApiKey) {
      setProgress({stage: "error", message: openRouterMessages.missingApiKey, error: openRouterMessages.missingApiKey});
      return;
    }
    setEnglishSrtPath("");
    setProgress({stage: "converting", message: "Starting…", percent: 0});
    const result = await window.electronAPI.generateSubtitles.start({
      videoPath,
      lang,
      asrModel: resolvedAsrModel
    });
    await applyResult(result, false);
  }, [applyResult, resolvedAsrModel, hasApiKey, hasVideo, lang, videoPath]);

  const translate = useCallback(async () => {
    if (!sourceSrtPath) {
      setProgress({stage: "error", message: "Generate subtitles before translating"});
      return;
    }
    if (!hasApiKey) {
      setProgress({stage: "error", message: openRouterMessages.missingApiKey, error: openRouterMessages.missingApiKey});
      return;
    }
    setProgress({
      stage: "translating",
      message: "Translating to English…",
      percent: 0,
      sourceSrtPath
    });
    const result = await window.electronAPI.generateSubtitles.translate({
      sourceSrtPath,
      lang,
      translateModel: resolvedTranslateModel
    });
    await applyResult(result, true);
  }, [applyResult, hasApiKey, lang, sourceSrtPath, resolvedTranslateModel]);

  const showInFolder = useCallback((filePath: string) => {
    if (filePath) {
      window.electronAPI.showItemInFolder(filePath);
    }
  }, []);

  return {
    isOpen,
    open,
    close,
    cancel,
    generate,
    translate,
    progress,
    isBusy,
    hasApiKey,
    hasVideo,
    sourceKind,
    sourceSrtPath,
    englishSrtPath,
    asrModel: resolvedAsrModel,
    setAsrModel,
    translateModel: resolvedTranslateModel,
    setTranslateModel,
    asrModelOptions: ASR_MODELS,
    translateModelOptions: TRANSLATE_MODELS,
    showInFolder
  };
}
