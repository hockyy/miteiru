import {useCallback, useState} from "react";
import {SubtitleContainer} from "./dataStructures";
import {useDropzone} from "react-dropzone";

export const MiteiruDropzone = ({setCurrentSubtitle, setVideoSrc}) => {

  const onDrop = useCallback(acceptedFiles => {
    // const draggedVideo = {...acceptedFiles[0], src: `file:/${acceptedFiles[0].path}`}
    if (acceptedFiles[0].path.endsWith('.srt')) {
      const draggedSubtitle = {
        type: 'text/plain',
        src: `${acceptedFiles[0].path}`
      }
      const tmpFile = new SubtitleContainer(draggedSubtitle.src);
      setCurrentSubtitle(tmpFile)
    } else if (acceptedFiles[0].path.endsWith('.mp4') || acceptedFiles[0].path.endsWith('.mkv')) {
      const draggedVideo = {
        type: 'video/webm',
        src: `miteiru://${acceptedFiles[0].path}`
      }
      setVideoSrc(draggedVideo)
    }
  }, [])

  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    onDrop,
    noDragEventsBubbling: true,
  })

  return (<div style={{
    backgroundColor: "red",
    position: "fixed",
    top: "90vh",
    width: "100vw"
  }}>
    <div {...getRootProps()}>
      <input {...getInputProps()}/>
      {
        isDragActive ?
            <p>Drop the files here ...</p> :
            <p>Drag 'n' drop some files here, or click to select files</p>
      }
    </div>
  </div>)
}

export default MiteiruDropzone;