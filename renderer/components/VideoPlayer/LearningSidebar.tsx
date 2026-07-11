/**
 * Learning settings sidebar (X on /learn, Ctrl+X opens vocab sidebar).
 * OpenRouter key + model feed hooks/useAiTranslation.ts and hooks/useSentenceAnalysis.ts
 * via useStoreData('openrouter.apiKey' | 'openrouter.model').
 */
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {Button} from "../Utils/Button";
import {defaultLearningStyling} from "../../utils/CJKStyling";
import {StylingBox} from "./Sidebar";
import {useStoreData} from "../../hooks/useStoreData";
import {SidebarSection, SidebarShell, SIDEBAR_FIELD_INPUT} from "./SidebarShell";
import {useExportAllAnkiCards} from "../../hooks/useExportAllAnkiCards";

export const LearningSidebar = ({
                                  showSidebar,
                                  setShowSidebar,
                                  primaryStyling,
                                  setPrimaryStyling,
                                  lang,
                                  tokenizeMiteiru,
                                }) => {
  const [openRouterApiKey, setOpenRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel, setOpenRouterModel] = useStoreData('openrouter.model', 'z-ai/glm-5.2:nitro');
  const [modelDraft, setModelDraft] = useState(openRouterModel);
  const [googleVisionApiKey, setGoogleVisionApiKey] = useStoreData('google.vision.apiKey', '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);

  useEffect(() => {
    setModelDraft(openRouterModel);
  }, [openRouterModel]);

  // Model field edits draft only; persist on Save (API key still saves immediately)
  const handleSaveModel = useCallback(() => {
    setOpenRouterModel(modelDraft.trim());
  }, [modelDraft, setOpenRouterModel]);

  const modelHasUnsavedChanges = useMemo(
    () => modelDraft.trim() !== openRouterModel,
    [modelDraft, openRouterModel],
  );

  const { exportAllAnkiCards, ankiExportModal } = useExportAllAnkiCards({ lang, tokenizeMiteiru });

  return <>
  {ankiExportModal}
  <SidebarShell
      showSidebar={showSidebar}
      setShowSidebar={setShowSidebar}
      title="Learning Settings"
      subtitle="AI providers, OCR, and study subtitle styling"
  >
    {/* OpenRouter Settings */}
    <SidebarSection title="OpenRouter AI">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/85">Model</label>
        <div className="flex min-w-0 flex-row gap-2 items-center">
          <input
            type="text"
            placeholder="e.g., z-ai/glm-5.2:nitro"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            className={SIDEBAR_FIELD_INPUT}
          />
          <Button
            type="primary"
            size="small"
            className="shrink-0"
            onPress={handleSaveModel}
            disabled={!modelHasUnsavedChanges || !modelDraft.trim()}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/85">API Key</label>
        <div className="flex min-w-0 flex-row gap-2 items-center">
          <input
            type={showApiKey ? "text" : "password"}
            placeholder="OpenRouter API Key"
            value={openRouterApiKey}
            onChange={(e) => setOpenRouterApiKey(e.target.value)}
            className={SIDEBAR_FIELD_INPUT}
          />
          <Button
            type="secondary"
            size="small"
            className="shrink-0"
            onPress={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
    </SidebarSection>

    {/* Google Vision Settings */}
    <SidebarSection title="Google Cloud Vision OCR">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/85">API Key</label>
        <div className="flex min-w-0 flex-row gap-2 items-center">
          <input
            type={showGoogleApiKey ? "text" : "password"}
            placeholder="Google Cloud Vision API Key"
            value={googleVisionApiKey}
            onChange={(e) => setGoogleVisionApiKey(e.target.value)}
            className={SIDEBAR_FIELD_INPUT}
          />
          <Button
            type="secondary"
            size="small"
            className="shrink-0"
            onPress={() => setShowGoogleApiKey(!showGoogleApiKey)}
          >
            {showGoogleApiKey ? "Hide" : "Show"}
          </Button>
        </div>
        <div className="text-xs text-white/50">
          For image OCR feature. Get your key at <span className="text-blue-300">console.cloud.google.com</span>
        </div>
      </div>
    </SidebarSection>

    <SidebarSection title="Learning Subtitle">
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                subtitleName={"CJK"} defaultStyling={defaultLearningStyling} lang={lang}/>
    </SidebarSection>

    <SidebarSection title="Anki Export">
      <Button
          type={"secondary"}
          className={"w-full min-w-0 max-w-full"}
          onPress={exportAllAnkiCards}
      >
        Export All Anki Cards
      </Button>
    </SidebarSection>
  </SidebarShell>
  </>;
}