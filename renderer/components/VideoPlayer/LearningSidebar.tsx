import React, {useState} from "react";
import {defaultLearningStyling} from "../../utils/CJKStyling";
import {StylingBox} from "./Sidebar";
import {useStoreData} from "../../hooks/useStoreData";
import {SidebarSection, SidebarShell} from "./SidebarShell";

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

  return <SidebarShell
      showSidebar={showSidebar}
      setShowSidebar={setShowSidebar}
      title="Learning Settings"
      subtitle="AI providers, OCR, and study subtitle styling"
  >
    {/* OpenRouter Settings */}
    <SidebarSection title="OpenRouter AI">
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
    </SidebarSection>

    {/* Google Vision Settings */}
    <SidebarSection title="Google Cloud Vision OCR">
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
    </SidebarSection>

    <SidebarSection title="Learning Subtitle">
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                subtitleName={"CJK"} defaultStyling={defaultLearningStyling} lang={lang}/>
    </SidebarSection>
  </SidebarShell>
}