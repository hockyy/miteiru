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

export const MiteiruDropzone = ({onDrop}) => {

  const {getRootProps} = useDropzone({
    noClick: true,
    onDrop,
    noKeyboard: true,
    noDragEventsBubbling: true
  })

  return (
      <div {...getRootProps()} className={"unselectable"} style={{
        zIndex: 4,
        position: "fixed",
        top: "0vh",
        height: "100vh",
        width: "100vw"

      }}>
      </div>)
}

export default MiteiruDropzone;