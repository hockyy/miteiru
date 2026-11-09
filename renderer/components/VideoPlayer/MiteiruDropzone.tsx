import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {isYoutube} from "../../utils/utils";
import {droppedWebLink, droppedYoutubeUrl, loadMediaPaths, looksLikeWebLink} from "../../utils/mediaUtils";
import {isTextEntryTarget} from "../../utils/keyboardTargets";

export const MiteiruDropzone = ({
                                  onDrop,
                                  deltaTime,
                                  lang
                                }: {
  onDrop: (files: { path: string; target?: 'primary' | 'secondary' }[]) => unknown;
  deltaTime?: (seconds: number) => void;
  /** The language being learned: subtitles beside a dropped video are routed by the language in their name. */
  lang?: string;
}) => {
  const dropRef = useRef<HTMLDivElement>(null);
  // Files are being dragged over the window: show where they go. The browser sends dragover every
  // few dozen ms while a drag is over the window, and a drag can leave or be cancelled without a
  // matching dragleave, so the cue lasts as long as dragover keeps coming.
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragEndTimer = useRef<number | undefined>(undefined);

  // Dropped anywhere in the window (the empty page, a dialog, the video, even a text field); text
  // dragged into a text field is left to the field.
  const keepsOwnDrop = (e: DragEvent) =>
    isTextEntryTarget(e.target) && !e.dataTransfer?.types.includes('Files');

  const handleDrag = useCallback((e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      setDraggingFiles(true);
      window.clearTimeout(dragEndTimer.current);
      dragEndTimer.current = window.setTimeout(() => setDraggingFiles(false), 300);
    }
    if (keepsOwnDrop(e)) return;
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    window.clearTimeout(dragEndTimer.current);
    setDraggingFiles(false);
    if (keepsOwnDrop(e)) return;
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;

    const url = droppedYoutubeUrl(dt);
    if (url) {
      onDrop([{path: url}]);
      return;
    }
    // Another site's link: the loader says that only YouTube opens.
    const otherLink = dt.files.length === 0 ? droppedWebLink(dt) : undefined;
    if (otherLink) {
      onDrop([{path: otherLink}]);
      return;
    }
    // Windows and macOS deliver DOM drops and preserve file paths through their native hooks.
    const pathsForDroppedFiles = window.miteiru?.pathsForDroppedFiles;
    if (pathsForDroppedFiles && dt.files.length > 0) {
      pathsForDroppedFiles(dt.files).then((paths) => loadMediaPaths(paths, onDrop, lang));
    }
  }, [onDrop, lang]);

  // Linux: files dropped on the window arrive as paths from the native drag-drop event.
  useEffect(() => {
    const onFileDrop = window.miteiru?.onFileDrop;
    if (!onFileDrop) return;
    return onFileDrop((paths: string[]) => loadMediaPaths(paths, onDrop, lang), setDraggingFiles);
  }, [onDrop, lang]);

  const pasteEvent = useCallback((event: ClipboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }

    const clipText = event.clipboardData?.getData('text')?.trim() ?? '';
    // Other text is a normal paste; another site's link gets the "only YouTube" message from the loader.
    if (!clipText || !(isYoutube(clipText) || looksLikeWebLink(clipText))) {
      return;
    }

    event.preventDefault();
    onDrop([{path: clipText}]);
  }, [onDrop]);

  useEffect(() => {
    window.addEventListener("paste", pasteEvent);
    return () => {
      window.removeEventListener("paste", pasteEvent);
    };
  }, [pasteEvent]);

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    const div = dropRef.current;
    if (div && deltaTime) {
      const rect = div.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width / 2) {
        // Double click on the right half
        deltaTime(5); // Skip forward 5 seconds
      } else {
        // Double click on the left half
        deltaTime(-5); // Skip backward 5 seconds
      }
    }
  }, [deltaTime]);

  useEffect(() => {
    window.addEventListener('dragover', handleDrag);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDrag);
      window.removeEventListener('drop', handleDrop);
      window.clearTimeout(dragEndTimer.current);
    };
  }, [handleDrag, handleDrop]);

  useEffect(() => {
    const div = dropRef.current;
    if (div) {
      div.addEventListener('dblclick', handleDoubleClick);
      return () => {
        div.removeEventListener('dblclick', handleDoubleClick);
      };
    }
  }, [handleDoubleClick]);

  const divStyle = useMemo(() => ({
    zIndex: 4,
    position: "fixed" as const,
    top: "0vh",
    height: "100vh",
    width: "100vw"
  }), []);

  return (
      <>
        <div ref={dropRef} className="unselectable" style={divStyle}/>
        {draggingFiles && (
            <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-blue-950/40 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-dashed border-white/80 bg-blue-950/70 px-8 py-6 text-center text-white shadow-2xl">
                <div className="text-lg font-black">Drop to open</div>
                <div className="mt-1 text-sm text-blue-100">A video, its subtitles, or both</div>
              </div>
            </div>
        )}
      </>
  );
}

export default MiteiruDropzone;
