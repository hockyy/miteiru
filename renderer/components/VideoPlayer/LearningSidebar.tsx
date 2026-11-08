/**
 * Learning settings sidebar (X on /learn, Ctrl+X opens vocab sidebar).
 * The OpenRouter key + model (OpenRouterSettings, also in Video settings' AI tab) feed
 * hooks/useAiTranslation.ts and hooks/useSentenceAnalysis.ts.
 */
import React from "react";
import {Button} from "../Utils/Button";
import {defaultLearningStyling} from "../../utils/CJKStyling";
import {StylingBox} from "./Sidebar";
import {SidebarSection, SidebarShell} from "./SidebarShell";
import {OpenRouterSettings} from "./OpenRouterSettings";
import {useExportAllAnkiCards} from "../../hooks/useExportAllAnkiCards";

export const LearningSidebar = ({
                                  showSidebar,
                                  setShowSidebar,
                                  primaryStyling,
                                  setPrimaryStyling,
                                  lang,
                                  tokenizeMiteiru,
                                }) => {
  const { exportAllAnkiCards, ankiExportModal } = useExportAllAnkiCards({ lang, tokenizeMiteiru });

  return <>
  {ankiExportModal}
  <SidebarShell
      showSidebar={showSidebar}
      setShowSidebar={setShowSidebar}
      title="Learning Settings"
      subtitle="Your OpenRouter key for AI tools, and how study subtitles look"
  >
    <OpenRouterSettings/>

    <SidebarSection title="Learning Subtitle">
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                isMain defaultStyling={defaultLearningStyling} lang={lang}/>
    </SidebarSection>

    <SidebarSection title="Anki Export">
      <Button
          type={"secondary"}
          className={"w-full min-w-0 max-w-full"}
          onPress={exportAllAnkiCards}
      >
        Export words with notes to Anki…
      </Button>
      <div className="text-xs text-white/60">Words without My Notes are skipped. Add one in a word&rsquo;s popup.</div>
    </SidebarSection>
  </SidebarShell>
  </>;
}