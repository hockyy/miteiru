import React, {useCallback, useEffect, useRef} from "react";
import {extractVideoId, isYoutube, isVideo} from "../../utils/utils";

export const MiteiruDropzone = ({onDrop}) => {
  const dropRef = useRef<HTMLDivElement>(null);  // Explicitly declaring the type of the ref

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    const url = dt.getData('text/plain');
    const files = [...dt.files]; // Spread operator to convert FileList to an Array

    if (isYoutube(url)) {
      onDrop([{path: url}]);
    } else if (files.length) {
      const filesWithPath = files.map(file => ({path: file.path}));
      
      // Check if the dropped file is a video
      const videoFile = files.find(file => isVideo(file.name));
      
      if (videoFile) {
        const videoFilePath = videoFile.path;
        const videoFileName = basename(videoFilePath, extname(videoFilePath));
        const videoDirectory = dirname(videoFilePath);
        
        // Check for an accompanying subtitle file (*.srt or *.ass) in the same directory
        const subtitleExtensions = ['.srt', '.ass'];
        let subtitleFile = null;
        
        for (const ext of subtitleExtensions) {
          const subtitleFilePath = join(videoDirectory, videoFileName + ext);
          try {
            await access(subtitleFilePath);
            subtitleFile = {path: subtitleFilePath};
            break;
          } catch (error) {
            // Subtitle file does not exist, continue to the next extension
          }
        }
        
        if (subtitleFile) {
          // If a subtitle file is found, include it in the onDrop call
          onDrop([{path: videoFilePath}]);
          onDrop([subtitleFile]);
        } else {
          // If no subtitle file is found, just include the video file
          onDrop([{path: videoFilePath}]);
        }
      } else {
        // If the dropped file is not a video, handle it as before
        onDrop(filesWithPath);
      }
    }
  }, [onDrop]);

  useEffect(() => {
    const pasteEvent = () => {
      navigator.clipboard.readText().then((clipText) => {
        const videoId = extractVideoId(clipText);
        if (videoId) {
          const path = [{path: clipText}]
          onDrop(path)
        }
      });
    };

    window.addEventListener("paste", pasteEvent);

    // Cleanup
    return () => {
      window.removeEventListener("paste", pasteEvent);
    };
  }, [onDrop]);

  useEffect(() => {
    const div = dropRef.current;

    if (div) {
      div.addEventListener('dragover', handleDrag);
      div.addEventListener('drop', handleDrop);

      return () => {
        div.removeEventListener('dragover', handleDrag);
        div.removeEventListener('drop', handleDrop);
      }
    }
  }, [handleDrop]); // Pass an empty array to ensure that the effect runs only once

  return (
      <div ref={dropRef} className={"unselectable"} style={{
        zIndex: 4,
        position: "fixed",
        top: "0vh",
        height: "100vh",
        width: "100vw"
      }}>
      </div>
  );
}

export default MiteiruDropzone;
