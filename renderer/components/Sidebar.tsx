import {ArrowLeft} from "./Icons";
import React from "react";
import {PopoverPicker} from "./PopoverPicker";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling
} from "../utils/CJKStyling";
import {ipcRenderer} from "electron";

const StylingBox = ({
                      subtitleStyling,
                      setSubtitleStyling,
                      subtitleName,
                      defaultStyling
                    }) => {
  return <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable"}>
    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.text.color} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.text.color = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Subtitle Text Color
    </div>
    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.text.hoverColor} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.text.hoverColor = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Subtitle Hover Color
    </div>

    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.stroke.color} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.stroke.color = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Subtitle Stroke Color
    </div>
    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.stroke.hoverColor} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.stroke.hoverColor = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Subtitle Hover Stroke Color
    </div>
    <div className={"w-full flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.background} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.background = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Background Color
    </div>
    <div className={"flex w-full justify-center items-center"}>
      Stroke Width
      <input
          className={"slider"}
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={parseFloat(subtitleStyling.stroke.width.trim('px'))}
          onChange={event => {
            const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
            newCopy.stroke.width = event.target.value + "px";
            setSubtitleStyling(newCopy)
          }}
      />
    </div>
    <button
        type={"button"}
        className='enabled:bg-red-600 p-3 rounded-sm enabled:hover:bg-red-700'
        onClick={() => {
          setSubtitleStyling(defaultStyling)
        }
        }
    >
      Reset
    </button>
    <div className={"flex flex-row gap-2"}>
    <button
        type={"button"}
        className='w-full enabled:bg-green-600 p-3 rounded-sm enabled:hover:bg-green-700'
        onClick={() => {
          ipcRenderer.invoke("readFile", ["json"]).then((val)=>{
            try {
              const parsed = JSON.parse(val) as CJKStyling;
              setSubtitleStyling(parsed)
            } catch (e) {
              console.log(e)
            }

          })
        }
        }
    >
      Import
    </button>
    <button
        type={"button"}
        className='w-full enabled:bg-blue-600 p-3 rounded-sm enabled:hover:bg-blue-700'
        onClick={() => {
          ipcRenderer.invoke("saveFile", ["json"], JSON.stringify(subtitleStyling))
        }
        }
    >
      Export
    </button></div>
  </div>
}

export const Sidebar = ({
                          showSidebar,
                          setShowSidebar,
                          primaryStyling,
                          setPrimaryStyling,
                          secondaryStyling,
                          setSecondaryStyling,
                        }) => {
  return <div style={{
    transition: "all 0.3s ease-out",
    transform: `translate(${!showSidebar ? "25vw" : "0"}, 0`
  }}
              className={"overflow-y-scroll overflow-x-clip flex flex-col content-center items-center p-3 z-[19] fixed right-0 top-0 h-screen w-[25vw] bg-gray-700/70"}>

    <button className={"self-start p-2"} onClick={() => {
      setShowSidebar(old => !old)
    }
    }>
      <div className={"animation h-5"}>
        {ArrowLeft}
      </div>
    </button>
    <div className={"font-bold unselectable text-3xl m-4"}>
      Settings
    </div>
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                subtitleName={"CJK"} defaultStyling={defaultPrimarySubtitleStyling}/>
    <hr className={"w-full h-1 m-5"}/>
    <StylingBox subtitleStyling={secondaryStyling} setSubtitleStyling={setSecondaryStyling}
                subtitleName={"Other"} defaultStyling={defaultSecondarySubtitleStyling}/>
  </div>
}