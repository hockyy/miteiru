import React, {useEffect, useRef} from "react";
import {extractVideoId, isYoutube} from "../utils/utils";

export const MiteiruDropzone = ({onDrop}) => {
  const dropRef = useRef<HTMLDivElement>(null);  // Explicitly declaring the type of the ref

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    const url = dt.getData('text/plain');
    const files = [...dt.files]; // Spread operator to convert FileList to an Array

    if (isYoutube(url)) {
      onDrop([{path: url}]);
    } else if (files.length) {
      const filesWithPath = files.map(file => ({path: file.path}));
      onDrop(filesWithPath);
    }
  };

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
  }, []); // Pass an empty array to ensure that the effect runs only once

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
