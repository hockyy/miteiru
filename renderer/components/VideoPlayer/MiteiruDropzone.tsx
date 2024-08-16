import React, {useCallback, useEffect, useMemo, useRef} from "react";
import {extractVideoId, isVideo, isYoutube} from "../../utils/utils";

export const MiteiruDropzone = ({onDrop}) => {
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
          if (subtitleFilePath) {
            onDrop([{path: videoFilePath}, {path: subtitleFilePath}]);
          } else {
            onDrop([{path: videoFilePath}]);
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

  useEffect(() => {
    const div = dropRef.current;
    if (div) {
      div.addEventListener('dragover', handleDrag);
      div.addEventListener('drop', handleDrop);
      return () => {
        div.removeEventListener('dragover', handleDrag);
        div.removeEventListener('drop', handleDrop);
      };
    }
  }, [handleDrag, handleDrop]);

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