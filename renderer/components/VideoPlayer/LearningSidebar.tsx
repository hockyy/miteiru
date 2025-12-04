import {ArrowLeft} from "./Icons";
import React, {useState} from "react";
import {defaultLearningStyling} from "../../utils/CJKStyling";
import {StylingBox} from "./Sidebar";
import {useStoreData} from "../../hooks/useStoreData";

export const LearningSidebar = ({
                                  showSidebar,
                                  setShowSidebar,
                                  primaryStyling,
                                  setPrimaryStyling,
                                  lang
                                }) => {
  const [openRouterApiKey, setOpenRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel, setOpenRouterModel] = useStoreData('openrouter.model', 'anthropic/claude-3.5-sonnet');
  const [googleVisionApiKey, setGoogleVisionApiKey] = useStoreData('google.vision.apiKey', '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);

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

    {/* OpenRouter Settings */}
    <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable mb-5"}>
      <div className={"font-bold text-xl mb-2"}>OpenRouter AI Settings</div>
      <div className="flex flex-col gap-2">
        <label className="text-sm">Model</label>
        <input
          type="text"
          placeholder="e.g., anthropic/claude-3.5-sonnet"
          value={openRouterModel}
          onChange={(e) => setOpenRouterModel(e.target.value)}
          className="p-2 border rounded text-black"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm">API Key</label>
        <div className="flex flex-row gap-2 items-center">
          <input
            type={showApiKey ? "text" : "password"}
            placeholder="OpenRouter API Key"
            value={openRouterApiKey}
            onChange={(e) => setOpenRouterApiKey(e.target.value)}
            className="flex-grow p-2 border rounded text-black"
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="p-2 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none text-black"
          >
            {showApiKey ? "Hide" : "Show"}
          </button>
        </div>
      </div>
    </div>

    <hr className={"w-full h-1 m-5"}/>

    {/* Google Vision Settings */}
    <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable mb-5"}>
      <div className={"font-bold text-xl mb-2"}>Google Cloud Vision OCR</div>
      <div className="flex flex-col gap-2">
        <label className="text-sm">API Key</label>
        <div className="flex flex-row gap-2 items-center">
          <input
            type={showGoogleApiKey ? "text" : "password"}
            placeholder="Google Cloud Vision API Key"
            value={googleVisionApiKey}
            onChange={(e) => setGoogleVisionApiKey(e.target.value)}
            className="flex-grow p-2 border rounded text-black"
          />
          <button
            onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
            className="p-2 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none text-black"
          >
            {showGoogleApiKey ? "Hide" : "Show"}
          </button>
        </div>
        <div className="text-xs text-gray-300">
          For image OCR feature. Get your key at <span className="text-blue-300">console.cloud.google.com</span>
        </div>
      </div>
    </div>

    <hr className={"w-full h-1 m-5"}/>
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                subtitleName={"CJK"} defaultStyling={defaultLearningStyling} lang={lang}/>
    <hr className={"w-full h-1 m-5"}/>
  </div>
}