import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {isYoutube} from "../../utils/utils";
import {loadMediaPaths} from "../../utils/mediaUtils";
import {isTextEntryTarget} from "../../utils/keyboardTargets";

export const MiteiruDropzone = ({
                                  onDrop,
                                  deltaTime
                                }) => {
  const dropRef = useRef<HTMLDivElement>(null);
  // Files are being dragged over the window: show where they go. The browser sends dragover every
  // few dozen ms while a drag is over the window, and a drag can leave or be cancelled without a
  // matching dragleave, so the cue lasts as long as dragover keeps coming.
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragEndTimer = useRef<number | undefined>(undefined);

  // Files dropped anywhere in the window (the empty page, a dialog, the video, even a text field) are
  // opened; text dragged into a text field is left to the field.
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

    const url = dt.getData('text/plain');
    const files = Array.from(dt.files);

    if (isYoutube(url)) {
      onDrop([{path: url}]);
    } else if (files.length) {
      const paths = files.map((file) => window.electronAPI.getPath(file));
      console.log('[file-drop] resolved files', paths);
      loadMediaPaths(paths, onDrop);
    }
  }, [onDrop]);

  const pasteEvent = useCallback((event: ClipboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }

    const clipText = event.clipboardData?.getData('text')?.trim() ?? '';
    if (!clipText || !isYoutube(clipText)) {
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