import {ArrowLeft} from "./Icons";
import React from "react";
import {defaultLearningStyling} from "../../utils/CJKStyling";
import {StylingBox} from "./Sidebar";

export const LearningSidebar = ({
                                  showSidebar,
                                  setShowSidebar,
                                  primaryStyling,
                                  setPrimaryStyling,
                                  lang
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
                subtitleName={"CJK"} defaultStyling={defaultLearningStyling} lang={lang}/>
    <hr className={"w-full h-1 m-5"}/>
  </div>
}