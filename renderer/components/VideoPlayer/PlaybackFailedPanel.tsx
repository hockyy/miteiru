import React from "react";
import {Button} from "../Utils/Button";

/**
 * Shown over the empty video area when mpv can't play a local file: the file's name and a way on,
 * instead of a black screen with controls that look fine.
 */
export const PlaybackFailedPanel = ({fileName, onTryAnother}: { fileName: string; onTryAnother: () => void }) => (
  <div className="pointer-events-none fixed inset-0 z-[10] flex items-center justify-center p-6">
    <div
      role="alert"
      className="pointer-events-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/85 px-8 py-6 text-center text-white shadow-2xl backdrop-blur-sm"
    >
      <div className="text-lg font-black">Miteiru couldn&rsquo;t play this file</div>
      <div className="max-w-full break-words text-sm text-white/80">{fileName}</div>
      <div className="text-xs text-white/60">The file may be damaged, or in a format this computer can&rsquo;t play.</div>
      <Button type="primary" onPress={onTryAnother}>Try another file</Button>
    </div>
  </div>
);

export default PlaybackFailedPanel;
