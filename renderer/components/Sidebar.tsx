import {ArrowLeft} from "./Icons";
import React from "react";
import {PopoverPicker} from "./PopoverPicker";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling
} from "../utils/CJKStyling";
import Toggle from "./Toggle";
import {useMiteiruApi} from "../hooks/useMiteiruApi";

const StylingBox = ({
                      subtitleStyling,
                      setSubtitleStyling,
                      subtitleName,
                      defaultStyling
                    }) => {
  const {miteiruApi} = useMiteiruApi();
  return <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable"}>
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle defaultCheck={subtitleStyling.showFurigana} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.showFurigana = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Show Furigana
    </div>}
    {subtitleName == "CJK" && subtitleStyling.showFurigana &&
        <div className={"flex flex-row items-center gap-3"}>
          <Toggle defaultCheck={subtitleStyling.showFuriganaOnKana} onChange={(val) => {
            const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
            newCopy.showFuriganaOnKana = val;
            setSubtitleStyling(newCopy)
          }
          }/>
          {subtitleName} Show Furigana on Kana
        </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle defaultCheck={subtitleStyling.showRomaji} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.showRomaji = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Show Romaji
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle defaultCheck={subtitleStyling.showMeaning} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.showMeaning = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Show Meaning
    </div>}
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

    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.textMeaning.color} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.textMeaning.color = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Meaning Text Color
    </div>}
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
          max={1.5}
          step={0.02}
          value={parseFloat(subtitleStyling.stroke.width.trim('px'))}
          onChange={event => {
            const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
            newCopy.stroke.width = event.target.value + "px";
            setSubtitleStyling(newCopy)
          }}
      />
    </div>
    <div className={"flex w-full justify-center items-center"}>
      Font Size
      <input
          className={"slider"}
          type="range"
          min={10}
          max={100}
          step={1}
          value={parseInt(subtitleStyling.text.fontSize.trim('px'))}
          onChange={event => {
            const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
            newCopy.text.fontSize = event.target.value + "px";
            setSubtitleStyling(newCopy)
          }}
      />
    </div>
    <div className={"flex flex-row items-center gap-3"}>
      <Toggle defaultCheck={subtitleStyling.positionFromTop} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.positionFromTop = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Subtitle Position From Top
    </div>
    <div className={"flex w-full justify-center items-center"}>
      Position from {subtitleStyling.positionFromTop ? 'top' : 'bottom'}
      <input
          className={"slider"}
          type="range"
          min={0}
          max={100}
          step={1}
          value={parseInt(subtitleStyling.position.trim('vh'))}
          onChange={event => {
            const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
            newCopy.position = event.target.value + "vh";
            setSubtitleStyling(newCopy)
          }}
      />
    </div>

    <div className={"flex flex-row items-center gap-3"}>
      <Toggle defaultCheck={subtitleStyling.positionMeaningTop} onChange={(val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.positionMeaningTop = val;
        setSubtitleStyling(newCopy)
      }
      }/>
      {subtitleName} Subtitle Position From Top
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
            miteiruApi.invoke("readFile", ["json"]).then((val) => {
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
            miteiruApi
            .invoke("saveFile", ["json"], JSON.stringify(subtitleStyling))
            .catch(e => {
              console.log(e)
            })
          }
          }
      >
        Export
      </button>
    </div>
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
    transform: `translate(${!showSidebar ? "30vw" : "0"}, 0`
  }}
              className={"overflow-y-scroll overflow-x-clip flex flex-col content-center items-center p-3 z-[19] fixed right-0 top-0 h-screen w-[30vw] bg-gray-700/70"}>

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