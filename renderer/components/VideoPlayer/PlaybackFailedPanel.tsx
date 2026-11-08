import React from "react";
import {Button} from "../Utils/Button";
import {describePlaybackFailure} from "./playbackFailure";

/**
 * Shown over the empty video area when mpv can't play a local file: what went wrong and a way on,
 * instead of a black screen with controls that look fine. `reason` is the player's error, when it
 * couldn't even start (see playbackFailure.ts).
 */
export const PlaybackFailedPanel = ({fileName, reason, onTryAnother}: {
  fileName: string;
  reason?: string;
  onTryAnother: () => void;
}) => {
  const failure = describePlaybackFailure(reason, typeof window === "undefined" ? undefined : window.electronAPI?.platform);
  return (
    <div className="pointer-events-none fixed inset-0 z-[10] flex items-center justify-center p-6">
      <div
        role="alert"
        className="pointer-events-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/85 px-8 py-6 text-center text-white shadow-2xl backdrop-blur-sm"
      >
        <div className="text-lg font-black">{failure.title}</div>
        <div className="max-w-full break-words text-sm text-white/80">{fileName}</div>
        <div className="select-text text-xs leading-relaxed text-white/60">{failure.detail}</div>
        {failure.canTryAnother && <Button type="primary" onPress={onTryAnother}>Try another file</Button>}
      </div>
    </div>
  );
};

export default PlaybackFailedPanel;
