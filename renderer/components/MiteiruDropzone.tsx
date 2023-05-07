import React, {useCallback, useState} from "react";
import {SubtitleContainer} from "./DataStructures";
import {useDropzone} from "react-dropzone";
import {Key} from "./KeyboardHelp";

const ActiveDropzoneCue = ({isActive}) => {
  const message = ["Drag here please UωU", "Drop Here (ᴗ_ ᴗ。)"]
  return <div
      className={"flex content-center items-center justify-center w-screen h-screen text-orange-200 text-5xl"}>
    <div
        style={{
          WebkitTextStrokeColor: "black",
          WebkitTextStrokeWidth: "1px",
          fontFamily: "Arial"
        }}
        className={"font-bold flex flex-col gap-2 justify-center items-center rounded-3xl border-[10px] border-dashed w-screen h-screen border-orange-500"}>

      <div>{message[+isActive]}</div>
      <div className={"flex flex-row justify-center items-center"}>
        or Press <Key extraClass={"mx-4 text-orange-500"} value={"X"}/> to toggle me~!
      </div>
    </div>
  </div>
}

export const MiteiruDropzone = ({setPrimarySub, setSecondarySub, setVideoSrc, mecab}) => {

  const onDrop = useCallback(async acceptedFiles => {
    // const draggedVideo = {...acceptedFiles[0], src: `file:/${acceptedFiles[0].path}`}
    // console.log(draggedVideo)
    let currentPath = acceptedFiles[0].path;
    currentPath = currentPath.replaceAll('\\', '/')
    let pathUri = currentPath
    if (process.platform === 'win32') {
      pathUri = '/' + currentPath
    }
    if (currentPath.endsWith('.srt') || currentPath.endsWith('.vtt') || currentPath.endsWith('.ass')) {
      const draggedSubtitle = {
        type: 'text/plain',
        src: `${currentPath}`
      }
      const tmpSub = await SubtitleContainer.create(draggedSubtitle.src, mecab);
      if (tmpSub.language === "JP") {
        setPrimarySub(tmpSub)
      } else {
        setSecondarySub(tmpSub)
      }
    } else if (currentPath.endsWith('.mp4') || currentPath.endsWith('.mkv')) {
      const draggedVideo = {
        type: 'video/webm',
        src: `miteiru://${pathUri}`
      }
      setVideoSrc(draggedVideo)
    }
  }, [])

  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    noClick: true,
    onDrop,
  })

  return (<div>
    <div {...getRootProps()} style={{
      zIndex: 20,
      backgroundColor: "rgba(171,248,255,0.45)",
      position: "fixed",
      top: "0vh",
      height: "100vh",
      width: "100vw"
    }}>
      <input {...getInputProps()}/>
      <ActiveDropzoneCue isActive={isDragActive}/>
    </div>
  </div>)
}

export default MiteiruDropzone;