import {useCallback, useState} from "react";
import {SubtitleContainer} from "./DataStructures";
import {useDropzone} from "react-dropzone";

export const MiteiruDropzone = ({setPrimarySub, setSecondarySub, setVideoSrc, mecab}) => {

  const onDrop = useCallback(acceptedFiles => {
    // const draggedVideo = {...acceptedFiles[0], src: `file:/${acceptedFiles[0].path}`}
    if (acceptedFiles[0].path.endsWith('.srt')) {
      const draggedSubtitle = {
        type: 'text/plain',
        src: `${acceptedFiles[0].path}`
      }
      const tmpSub = new SubtitleContainer(draggedSubtitle.src, mecab);
      if (tmpSub.language === "JP") {
        setPrimarySub(tmpSub)
      } else if (tmpSub.language === "EN") {
        setSecondarySub(tmpSub)
      }
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
  })

  return (<div>
    <div {...getRootProps()} style={{
      zIndex: 5,
      backgroundColor: "blue",
      opacity: "30%",
      position: "fixed",
      top: "0vh",
      height: "100vh",
      width: "100vw"
    }}>
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