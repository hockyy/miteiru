import React, {useCallback, useEffect, useMemo, useRef} from "react";
import {extractVideoId, isVideo, isYoutube} from "../../utils/utils";

export const MiteiruDropzone = ({
                                  onDrop,
                                  deltaTime
                                }) => {
  const dropRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (!dt) return;

    const url = dt.getData('text/plain');
    const files = Array.from(dt.files);

    if (isYoutube(url)) {
      onDrop([{path: url}]);
    } else if (files.length) {
      const filesWithPath = files.map(file => ({path: file.path}));
      const videoFile = files.find(file => isVideo(file.name));

      if (videoFile) {
        const videoFilePath = videoFile.path;
        window.electronAPI.checkSubtitleFile(videoFilePath).then(subtitleFilePath => {
          onDrop([{path: videoFilePath}]);
          for (const subPath of subtitleFilePath) {
            onDrop([{path: subPath}]);
          }
        });
      } else {
        onDrop(filesWithPath);
      }
    }
  }, [onDrop]);

  const pasteEvent = useCallback(() => {
    navigator.clipboard.readText().then((clipText) => {
      const videoId = extractVideoId(clipText);
      if (videoId) {
        onDrop([{path: clipText}]);
      }
    });
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
    const div = dropRef.current;
    if (div) {
      div.addEventListener('dragover', handleDrag);
      div.addEventListener('drop', handleDrop);
      div.addEventListener('dblclick', handleDoubleClick);
      return () => {
        div.removeEventListener('dragover', handleDrag);
        div.removeEventListener('drop', handleDrop);
        div.removeEventListener('dblclick', handleDoubleClick);
      };
    }
  }, [handleDrag, handleDrop, handleDoubleClick]);

  const divStyle = useMemo(() => ({
    zIndex: 4,
    position: "fixed" as const,
    top: "0vh",
    height: "100vh",
    width: "100vw"
  }), []);

  return (
      <div ref={dropRef} className="unselectable" style={divStyle}/>
  );
}

export default MiteiruDropzone;