import React, {ReactNode, useCallback, useState} from "react";
import {PopoverPicker} from "./PopoverPicker";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling,
  withStylingPath
} from "../../utils/CJKStyling";
import Toggle from "./Toggle";
import {Button} from "../Utils/Button";
import {GistManager} from "../Data/GistManager";
import {rangeFillStyle, SubtitleMode} from "../../utils/utils";
import {SidebarSection, SidebarSettingRow, SidebarShell} from "./SidebarShell";
import {OpenRouterSettings} from "./OpenRouterSettings";
import {useExportAllAnkiCards} from "../../hooks/useExportAllAnkiCards";
import {videoConstants} from "../../utils/constants";
import {FontPicker} from "../Utils/FontPicker";
import {SUBTITLE_FONT_OPTIONS} from "../../utils/fonts";
import {ColorKey} from "./ColorKey";
import {SubtitleTimingRow} from "./SubtitleTimingRow";
import {mainSubtitleName, TRANSLATION_NAME} from "../../utils/subtitleLabels";
import {getLanguageDisplayName} from "../../languages/manifest";
import {
  NOT_PROGRESS_FILE_MESSAGE,
  NOT_STYLE_FILE_MESSAGE,
  parseProgressFile,
  parseStyleFile,
  progressImportedMessage
} from "../../utils/importFiles";
import {formatKeys} from "../../utils/platform";

/** Tells the learner something short: the video page shows a toast; pages without one use an alert. */
export type Notify = (message: string) => void;
const alertNotify: Notify = (message) => window.alert(message);

/** Sets one (possibly nested) field of a subtitle style, e.g. `update("text.color", "#fff")`. */
const useStylingUpdate = (styling: CJKStyling, setStyling: (styling: CJKStyling) => void) =>
  useCallback((path: string, value: unknown) => setStyling(withStylingPath(styling, path, value)),
    [styling, setStyling]);

// The reading shown above words, by language; Vietnamese has none.
const READING_NAME: Record<string, string> = {
  [videoConstants.japaneseLang]: "furigana",
  [videoConstants.chineseLang]: "pinyin",
  [videoConstants.cantoneseLang]: "jyutping",
};

const Hint = ({children}: { children: ReactNode }) => (
  <div className="text-xs text-white/60">{children}</div>
);

const ToggleRow = ({label, hint, checked, onChange}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <SidebarSettingRow>
    <Toggle isChecked={Boolean(checked)} onChange={onChange} label={label}/>
    {/* The text toggles too; the switch alone is a small target. Keyboard users use the switch. */}
    <div className="min-w-0 flex-1 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <div>{label}</div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  </SidebarSettingRow>
);

const SliderRow = ({label, valueLabel, min, max, step, value, onChange}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) => (
  <div className="flex flex-col gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-sm text-white/85">
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-white/60">{valueLabel}</span>
    </div>
    <input className="slider" type="range" aria-label={label} min={min} max={max} step={step} value={value}
           style={rangeFillStyle(value, min, max)}
           onChange={(event) => onChange(event.target.valueAsNumber)}/>
  </div>
);

const ColorRow = ({label, color, onChange}: { label: string; color: string; onChange: (color: string) => void }) => (
  <div className="flex flex-row items-center gap-3 text-sm text-white/85">
    <PopoverPicker color={color} onChange={onChange}/>
    {label}
  </div>
);

const LearningFileButtons = ({lang, notify = alertNotify}: { lang: string; notify?: Notify }) => {
  const saveLearning = useCallback(() => {
    window.backend.invoke('loadLearningState', lang).then((val) => {
      window.backend.invoke("saveFile", ["json"], JSON.stringify(val))
    })
  }, [lang]);
  const loadLearning = useCallback(() => {
    window.backend.invoke("readFile", ["json"]).then(async (val) => {
      const progress = parseProgressFile(val);
      if (progress.kind === "cancelled") return;
      if (progress.kind === "invalid") {
        notify(NOT_PROGRESS_FILE_MESSAGE);
        return;
      }
      const saved = await window.backend.invoke("updateContentBatch", progress.words, lang);
      notify(saved === false ? "Couldn't save the words from that file" : progressImportedMessage(progress.count));
    }).catch((error) => {
      console.error(error);
      notify("Couldn't read that file");
    });
  }, [lang, notify]);
  return <div className="flex min-w-0 flex-row gap-2 w-full">
    <Button type="secondary" className="miteiru-btn--fill" onPress={saveLearning}>Save to a file…</Button>
    <Button type="secondary" className="miteiru-btn--fill" onPress={loadLearning}>Load from a file…</Button>
  </div>;
};

/** What the primary subtitle shows: readings, meanings, learning colours. */
export const SubtitleContentSettings = ({subtitleStyling, setSubtitleStyling, lang}: {
  subtitleStyling: CJKStyling;
  setSubtitleStyling: (styling: CJKStyling) => void;
  lang: string;
}) => {
  const update = useStylingUpdate(subtitleStyling, setSubtitleStyling);
  const reading = READING_NAME[lang];
  const japanese = lang === videoConstants.japaneseLang;
  return <div className="flex flex-col gap-3">
    {reading && <ToggleRow label={`Show ${reading}`} checked={subtitleStyling.showFurigana}
                           onChange={(value) => update("showFurigana", value)}/>}
    {japanese && subtitleStyling.showFurigana &&
        <ToggleRow label="Furigana on kana words too" hint="Otherwise only words with kanji get furigana."
                   checked={subtitleStyling.showFuriganaOnKana}
                   onChange={(value) => update("showFuriganaOnKana", value)}/>}
    {japanese && <ToggleRow label="Show romaji" checked={subtitleStyling.showRomaji}
                            onChange={(value) => update("showRomaji", value)}/>}
    {lang === videoConstants.chineseLang &&
        <ToggleRow label="Simplified characters" hint="On: simplified (简体). Off: traditional (繁體)."
                   checked={subtitleStyling.forceSimplified}
                   onChange={(value) => update("forceSimplified", value)}/>}
    <ToggleRow label="Show word meanings" checked={subtitleStyling.showMeaning}
               onChange={(value) => update("showMeaning", value)}/>
    {subtitleStyling.showMeaning && <>
      <ToggleRow label="Meanings above the words" checked={subtitleStyling.positionMeaningTop}
                 onChange={(value) => update("positionMeaningTop", value)}/>
      <SliderRow label="Longest meaning shown" valueLabel={`${subtitleStyling.maximalMeaningLengthPerCharacter} letters per character`}
                 min={0} max={20} step={1} value={Number(subtitleStyling.maximalMeaningLengthPerCharacter)}
                 onChange={(value) => update("maximalMeaningLengthPerCharacter", value)}/>
    </>}
    <ToggleRow label="Colour words by how well you know them" checked={subtitleStyling.learning}
               onChange={(value) => update("learning", value)}/>
    <ToggleRow label="Space between words" checked={subtitleStyling.showSpace}
               onChange={(value) => update("showSpace", value)}/>
    <ToggleRow label="Hide hearing-impaired notes"
               hint="Removes [sounds], (notes) and speaker names from both subtitles, from the next one loaded."
               checked={subtitleStyling.removeHearingImpaired}
               onChange={(value) => update("removeHearingImpaired", value)}/>
  </div>;
};

/** How a subtitle looks: font, colours, outline, background and position. */
export const SubtitleLookSettings = ({subtitleStyling, setSubtitleStyling, defaultStyling, name, withMeaning, notify = alertNotify}: {
  subtitleStyling: CJKStyling;
  setSubtitleStyling: (styling: CJKStyling) => void;
  defaultStyling: CJKStyling;
  /** What the learner calls this subtitle: "Japanese subtitles" or "Translation". */
  name: string;
  withMeaning: boolean;
  notify?: Notify;
}) => {
  const update = useStylingUpdate(subtitleStyling, setSubtitleStyling);
  const exportStyle = useCallback(() => {
    window.backend.invoke("saveFile", ["json"], JSON.stringify(subtitleStyling))
  }, [subtitleStyling]);
  const importStyle = useCallback(() => {
    window.backend.invoke("readFile", ["json"]).then((val) => {
      const style = parseStyleFile(val, defaultStyling);
      if (style.kind === "cancelled") return;
      if (style.kind === "invalid") {
        notify(NOT_STYLE_FILE_MESSAGE);
        return;
      }
      setSubtitleStyling(style.style);
      notify("Style loaded");
    }).catch((error) => {
      console.error(error);
      notify("Couldn't read that file");
    });
  }, [setSubtitleStyling, defaultStyling, notify]);
  const resetStyle = useCallback(() => {
    if (window.confirm(`Reset the style of the ${name} to the defaults?`)) setSubtitleStyling(defaultStyling);
  }, [defaultStyling, name, setSubtitleStyling]);
  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1.5 text-sm text-white/85">
      Font
      <FontPicker value={subtitleStyling.text.fontFamily} onChange={(value) => update("text.fontFamily", value)}
                  options={SUBTITLE_FONT_OPTIONS} label={`${name} font`}/>
    </div>
    <SliderRow label="Size" valueLabel={subtitleStyling.text.fontSize} min={10} max={100} step={1}
               value={parseInt(subtitleStyling.text.fontSize)} onChange={(value) => update("text.fontSize", `${value}px`)}/>
    <SliderRow label="Weight" valueLabel={String(subtitleStyling.text.weight)} min={100} max={800} step={100}
               value={Number(subtitleStyling.text.weight)} onChange={(value) => update("text.weight", value)}/>
    <ColorRow label="Text" color={subtitleStyling.text.color} onChange={(value) => update("text.color", value)}/>
    <ColorRow label="Text on hover" color={subtitleStyling.text.hoverColor}
              onChange={(value) => update("text.hoverColor", value)}/>
    <ColorRow label="Outline" color={subtitleStyling.stroke.color} onChange={(value) => update("stroke.color", value)}/>
    <ColorRow label="Outline on hover" color={subtitleStyling.stroke.hoverColor}
              onChange={(value) => update("stroke.hoverColor", value)}/>
    <SliderRow label="Outline width" valueLabel={subtitleStyling.stroke.width} min={0} max={1.5} step={0.02}
               value={parseFloat(subtitleStyling.stroke.width)} onChange={(value) => update("stroke.width", `${value}px`)}/>
    <ColorRow label="Background" color={subtitleStyling.background} onChange={(value) => update("background", value)}/>
    {withMeaning && <>
      <ColorRow label="Meaning text" color={subtitleStyling.textMeaning.color}
                onChange={(value) => update("textMeaning.color", value)}/>
      <ColorRow label="Meaning text on hover" color={subtitleStyling.textMeaning.hoverColor}
                onChange={(value) => update("textMeaning.hoverColor", value)}/>
      <SliderRow label="Meaning weight" valueLabel={String(subtitleStyling.textMeaning.weight)} min={100} max={800}
                 step={100} value={Number(subtitleStyling.textMeaning.weight)}
                 onChange={(value) => update("textMeaning.weight", value)}/>
    </>}
    <ToggleRow label="Place at the top of the screen" checked={subtitleStyling.positionFromTop}
               onChange={(value) => update("positionFromTop", value)}/>
    <SliderRow label={`Distance from the ${subtitleStyling.positionFromTop ? 'top' : 'bottom'}`}
               valueLabel={subtitleStyling.position} min={0} max={100} step={1}
               value={parseInt(subtitleStyling.position)} onChange={(value) => update("position", `${value}vh`)}/>
    <div className="flex min-w-0 flex-row gap-2 w-full">
      <Button type="secondary" className="miteiru-btn--fill" onPress={importStyle}>Import…</Button>
      <Button type="secondary" className="miteiru-btn--fill" onPress={exportStyle}>Export…</Button>
      <Button type="danger" className="miteiru-btn--fill" onPress={resetStyle}>Reset</Button>
    </div>
  </div>;
};

/** Content, learning files and look of one subtitle, in one column (the Learn page's sidebar). */
export const StylingBox = ({subtitleStyling, setSubtitleStyling, isMain, defaultStyling, lang}) => {
  const primary = Boolean(isMain);
  return <div className="w-full min-w-0 flex flex-col content-start gap-3 unselectable text-sm text-white/85">
    {primary && <SubtitleContentSettings subtitleStyling={subtitleStyling} setSubtitleStyling={setSubtitleStyling}
                                         lang={lang}/>}
    {primary && <LearningFileButtons lang={lang}/>}
    <SubtitleLookSettings subtitleStyling={subtitleStyling} setSubtitleStyling={setSubtitleStyling}
                          defaultStyling={defaultStyling} name={primary ? mainSubtitleName(getLanguageDisplayName(lang)) : TRANSLATION_NAME}
                          withMeaning={primary}/>
  </div>;
};

type SettingsTab = "playback" | "subtitles" | "look" | "ai" | "data";

const TABS: { id: SettingsTab; label: string }[] = [
  {id: "playback", label: "Playback"},
  {id: "subtitles", label: "Subtitles"},
  {id: "look", label: "Look"},
  {id: "ai", label: "AI"},
  {id: "data", label: "Data"},
];

const tabId = (group: string, id: string) => `${group}-tab-${id}`;
const panelId = (group: string, id: string) => `${group}-panel-${id}`;

/** One tab's content, labelled by its tab in `group`. */
const TabPanel = ({group, id, children}: { group: string; id: string; children: ReactNode }) => (
  <div role="tabpanel" id={panelId(group, id)} aria-labelledby={tabId(group, id)} className="flex flex-col gap-4">
    {children}
  </div>
);

const Segmented = <T extends string>({group, options, value, onChange, label}: {
  // Prefix for the tab and panel ids, unique per tab list.
  group: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div role="tablist" aria-label={label} className="flex w-full gap-1 rounded-xl bg-black/30 p-1"
       onKeyDown={(event) => {
         // Left/Right move between tabs, as the tab pattern expects.
         const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
         if (!step) return;
         event.preventDefault();
         const index = options.findIndex((option) => option.id === value);
         const next = options[(index + step + options.length) % options.length];
         onChange(next.id);
         document.getElementById(tabId(group, next.id))?.focus();
       }}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        role="tab"
        id={tabId(group, option.id)}
        aria-controls={panelId(group, option.id)}
        aria-selected={value === option.id}
        tabIndex={value === option.id ? 0 : -1}
        onClick={() => onChange(option.id)}
        className={[
          "flex-1 rounded-lg px-2 py-1.5 text-sm font-bold transition-colors",
          value === option.id ? "bg-white text-slate-900" : "text-white/70 hover:bg-white/10 hover:text-white"
        ].join(" ")}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const Sidebar = ({
                          showSidebar,
                          setShowSidebar,
                          primarySub,
                          primaryStyling,
                          setPrimaryStyling,
                          secondaryStyling,
                          setSecondaryStyling,
                          autoPause,
                          setAutoPause,
                          learningPercentage,
                          setLearningPercentage,
                          toneType,
                          setToneType,
                          lang,
                          tokenizeMiteiru,
                          subtitleMode,
                          setSubtitleMode,
                          setShowLyricsSearch,
                          pauseOnLookup,
                          setPauseOnLookup,
                          secondarySub,
                          primaryShift,
                          setPrimaryShift,
                          secondaryShift,
                          setSecondaryShift,
                          languageName,
                          notify
                        }) => {
  const {exportAllAnkiCards, ankiExportModal} = useExportAllAnkiCards({lang, tokenizeMiteiru});
  const [tab, setTab] = useState<SettingsTab>("playback");
  const [lookTarget, setLookTarget] = useState<"primary" | "secondary">("primary");
  const mainName = mainSubtitleName(languageName);
  const usesToneNumbers = lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang;
  const exportHufHandler = useCallback(() => {
    if (!primarySub || !primarySub.lines || primarySub.lines.length === 0) {
      alert(`No ${mainName.toLowerCase()} loaded to export.`);
      return;
    }

    try {
      const hufContent = primarySub.toHufString();
      window.backend.invoke("saveFile", ["huf", "json"], hufContent);
    } catch (error) {
      console.error('Failed to export HUF:', error);
      alert(`Failed to export HUF: ${error.message || 'Unknown error'}`);
    }
  }, [primarySub, mainName]);
  const isKaraoke = subtitleMode == SubtitleMode.Karaoke;
  return <>
    {ankiExportModal}
    <SidebarShell
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        title="Video settings"
        subtitle="Press X to open or close"
    >
      <Segmented<SettingsTab> group="settings" options={TABS} value={tab} onChange={setTab} label="Settings sections"/>

      {tab === "playback" && <TabPanel group="settings" id="playback"><SidebarSection>
        <ToggleRow label="Pause after each line" hint="Stops at the end of every line, for shadowing or reading."
                   checked={autoPause} onChange={setAutoPause}/>
        <ToggleRow label="Pause while I look up words"
                   hint="The video waits while a word's meaning is open, then carries on when you close it."
                   checked={pauseOnLookup} onChange={setPauseOnLookup}/>
        <ToggleRow label="Karaoke mode" hint="Scrolling lyrics instead of one line at a time."
                   checked={isKaraoke}
                   onChange={(value) => setSubtitleMode(value ? SubtitleMode.Karaoke : SubtitleMode.Normal)}/>
        <Button type="secondary" className="w-full min-w-0 max-w-full"
                onPress={() => setShowLyricsSearch?.(true)}>
          Find lyrics online (LRCLIB)…
        </Button>
        {usesToneNumbers &&
            <ToggleRow label="Tone numbers" hint={toneType === 'num' ? "ni3 hao3" : "Tone marks: nǐ hǎo"}
                       checked={toneType === 'num'} onChange={(value) => setToneType(value ? 'num' : 'symbol')}/>}
      </SidebarSection></TabPanel>}

      {tab === "subtitles" && <TabPanel group="settings" id="subtitles">
        <SidebarSection title="Timing">
          {primarySub?.lines?.length > 0 &&
              <SubtitleTimingRow name={mainName} shiftMs={primaryShift} setShiftMs={setPrimaryShift}/>}
          {secondarySub?.lines?.length > 0 &&
              <SubtitleTimingRow name={TRANSLATION_NAME} shiftMs={secondaryShift} setShiftMs={setSecondaryShift}/>}
          {!(primarySub?.lines?.length > 0) && !(secondarySub?.lines?.length > 0) &&
              <Hint>Load a subtitle to move it earlier or later.</Hint>}
          <Hint>
            Subtitles that show too early or too late? Move them here, or press [ (earlier) and ] (later);
            {" "}{formatKeys(["Ctrl", "["])} and {formatKeys(["Ctrl", "]"])} move the translation.
          </Hint>
        </SidebarSection>
        <SidebarSection title={mainName}>
          <SubtitleContentSettings subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                                   lang={lang}/>
        </SidebarSection>
        <SidebarSection title="Words to learn">
          <ColorKey/>
          <SliderRow label="Treat the most common words as known"
                     valueLabel={`top ${Math.round(learningPercentage * 10) / 10}%`}
                     min={0} max={100} step={0.4} value={learningPercentage} onChange={setLearningPercentage}/>
          <Hint>Words you have not saved yet that are this common in the subtitle count as known, so the
            rarer ones stand out.</Hint>
        </SidebarSection>
      </TabPanel>}

      {tab === "look" && <TabPanel group="settings" id="look"><SidebarSection>
        <Segmented<"primary" | "secondary"> group="subtitle-style" options={[{id: "primary", label: languageName || "Main"}, {id: "secondary", label: TRANSLATION_NAME}]}
                   value={lookTarget} onChange={setLookTarget} label="Subtitle to style"/>
        <TabPanel group="subtitle-style" id={lookTarget}>
        {lookTarget === "primary"
          ? <SubtitleLookSettings key="primary" subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                                  defaultStyling={defaultPrimarySubtitleStyling} name={mainName} withMeaning
                                  notify={notify}/>
          : <SubtitleLookSettings key="secondary" subtitleStyling={secondaryStyling}
                                  setSubtitleStyling={setSecondaryStyling}
                                  defaultStyling={defaultSecondarySubtitleStyling} name={TRANSLATION_NAME}
                                  withMeaning={false} notify={notify}/>}
        </TabPanel>
      </SidebarSection></TabPanel>}

      {tab === "ai" && <TabPanel group="settings" id="ai">
        <OpenRouterSettings/>
      </TabPanel>}

      {tab === "data" && <TabPanel group="settings" id="data">
        <SidebarSection title="Learning progress">
          <Hint>How well you know each word, for backups or another computer.</Hint>
          <LearningFileButtons lang={lang} notify={notify}/>
        </SidebarSection>
        <SidebarSection title="Anki">
          <Button type="secondary" className="w-full min-w-0 max-w-full" onPress={exportAllAnkiCards}>
            Export words with notes to Anki…
          </Button>
          <Hint>Words without My Notes are skipped. Add one in a word&rsquo;s popup.</Hint>
        </SidebarSection>
        <details className="rounded-2xl border border-white/10 bg-white/[0.04]">
          <summary className="cursor-pointer rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            Advanced
          </summary>
          <div className="flex flex-col gap-4 p-3 pt-0">
            <SidebarSection title={mainName}>
              <Button type="secondary" className="w-full min-w-0 max-w-full" onPress={exportHufHandler}>
                Save as lyrics (.huf)…
              </Button>
              <Hint>Miteiru’s lyrics format, with the word splits and readings.</Hint>
            </SidebarSection>
            <SidebarSection title="Sync with a GitHub Gist">
              <GistManager lang={lang}/>
            </SidebarSection>
          </div>
        </details>
      </TabPanel>}
    </SidebarShell>
  </>;
};
