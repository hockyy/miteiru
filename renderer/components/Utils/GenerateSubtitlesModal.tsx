import React from "react";
import {Captions, FolderOpen} from "lucide-react";
import {ModalShell} from "./ModalShell";
import {Button} from "./Button";
import {getLanguageDisplayName} from "../../languages/manifest";
import type {GenerateSubtitlesProgress} from "../../types/generateSubtitles";
import type {AsrModelOption} from "../../utils/generateSubtitlesConfig";

type GenerateSubtitlesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
  onTranslate: () => void;
  onCancel: () => void;
  onShowInFolder: (filePath: string) => void;
  progress: GenerateSubtitlesProgress;
  isBusy: boolean;
  hasApiKey: boolean;
  hasVideo: boolean;
  sourceKind: "youtube" | "local";
  lang: string;
  translateModel: string;
  setTranslateModel: (model: string) => void | Promise<void>;
  asrModel: string;
  setAsrModel: (model: string) => void | Promise<void>;
  asrModelOptions: AsrModelOption[];
  translateModelOptions: AsrModelOption[];
  sourceSrtPath: string;
  englishSrtPath: string;
};

const selectClass =
  "w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-medium text-blue-950 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300/50";

const stageLabel = (stage: GenerateSubtitlesProgress["stage"]) => {
  switch (stage) {
    case "converting":
      return "Converting audio";
    case "transcribing":
      return "Transcribing";
    case "saving":
      return "Saving";
    case "translating":
      return "Translating to English";
    case "done":
      return "Done";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Ready";
  }
};

const GenerateSubtitlesModal = ({
  isOpen,
  onClose,
  onGenerate,
  onTranslate,
  onCancel,
  onShowInFolder,
  progress,
  isBusy,
  hasApiKey,
  hasVideo,
  sourceKind,
  lang,
  asrModel,
  setAsrModel,
  translateModel,
  setTranslateModel,
  asrModelOptions,
  translateModelOptions,
  sourceSrtPath,
  englishSrtPath
}: GenerateSubtitlesModalProps) => {
  if (!isOpen) {
    return null;
  }

  const languageName = getLanguageDisplayName(lang);
  const percent = Math.max(0, Math.min(100, progress.percent ?? (isBusy ? 8 : 0)));
  const canTranslate = Boolean(sourceSrtPath) && !isBusy && hasApiKey;
  const showProgress = isBusy || progress.stage === "done" || progress.stage === "error" || progress.stage === "cancelled";

  return (
    <ModalShell
      title="Generate Subtitles"
      icon={<Captions className="h-5 w-5 text-yellow-300"/>}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      minSizeClassName="min-h-[280px] min-w-[min(92vw,22rem)]"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {isBusy ? (
            <Button type="danger" onPress={onCancel}>Cancel</Button>
          ) : (
            <Button type="secondary" onPress={onClose}>Close</Button>
          )}
          <Button
            type="primary"
            onPress={onGenerate}
            disabled={isBusy || !hasVideo || !hasApiKey}
          >
            {sourceSrtPath ? "Regenerate" : "Generate"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-white/90">
        <p>
          Transcribe the current video into <span className="font-semibold text-white">{languageName}</span> subtitles
          with Qwen3-ASR, then optionally add English as <span className="font-mono text-white">.en.srt</span>.
          Files are saved to Documents/miteiru.
        </p>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          Source: {sourceKind === "youtube" ? "YouTube audio via yt-dlp" : "local file via ffmpeg"}
          {!hasVideo ? " · load a video first" : ""}
          {!hasApiKey ? " · OpenRouter key missing (Ctrl+X)" : ""}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">ASR model</span>
          <select
            className={selectClass}
            value={asrModel}
            disabled={isBusy}
            onChange={(event) => setAsrModel(event.target.value)}
          >
            {asrModelOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        {showProgress && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
              <span>{stageLabel(progress.stage)}</span>
              {progress.current != null && progress.total != null && (
                <span>{progress.current}/{progress.total}</span>
              )}
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-2 rounded-full ${progress.stage === "error" ? "bg-red-400" : "bg-blue-400"} ${isBusy ? "transition-[width] duration-300" : ""}`}
                style={{width: `${percent}%`}}
              />
            </div>
            <div className={progress.stage === "error" ? "text-red-200" : "text-white/80"}>
              {progress.message || progress.error}
            </div>
          </div>
        )}

        {sourceSrtPath && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-white/70" title={sourceSrtPath}>{sourceSrtPath}</span>
              <Button type="secondary" size="small" onPress={() => onShowInFolder(sourceSrtPath)}>
                <span className="inline-flex items-center gap-1"><FolderOpen className="h-3.5 w-3.5"/> Folder</span>
              </Button>
            </div>
            {englishSrtPath && (
              <div className="truncate text-xs text-white/70" title={englishSrtPath}>{englishSrtPath}</div>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">English model</span>
              <select
                className={selectClass}
                value={translateModel}
                disabled={isBusy}
                onChange={(event) => setTranslateModel(event.target.value)}
              >
                {translateModelOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <Button
              type="primary"
              className="w-full"
              onPress={onTranslate}
              disabled={!canTranslate || !hasApiKey}
            >
              {englishSrtPath ? "Retranslate English" : "Translate to English"}
            </Button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default GenerateSubtitlesModal;
