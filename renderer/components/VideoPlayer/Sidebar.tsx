import React, {ReactNode, useCallback, useState} from "react";
import {PopoverPicker} from "./PopoverPicker";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling
} from "../../utils/CJKStyling";
import Toggle from "./Toggle";
import {Button} from "../Utils/Button";
import {GistManager} from "../Data/GistManager";
import {SubtitleMode} from "../../utils/utils";
import {SidebarSection, SidebarSettingRow, SidebarShell, SIDEBAR_FIELD_INPUT} from "./SidebarShell";
import {useExportAllAnkiCards} from "../../hooks/useExportAllAnkiCards";
import {videoConstants} from "../../utils/constants";

/** Sets one (possibly nested) field of a subtitle style, e.g. `update("text.color", "#fff")`. */
const useStylingUpdate = (styling: CJKStyling, setStyling: (styling: CJKStyling) => void) =>
  useCallback((path: string, value: unknown) => {
    const copy = JSON.parse(JSON.stringify(styling));
    const keys = path.split(".");
    let target = copy;
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys[keys.length - 1]] = value;
    setStyling(copy);
  }, [styling, setStyling]);

// The reading shown above words, by language; Vietnamese has none.
const READING_NAME: Record<string, string> = {
  [videoConstants.japaneseLang]: "furigana",
  [videoConstants.chineseLang]: "pinyin",
  [videoConstants.cantoneseLang]: "jyutping",
};

const Hint = ({children}: { children: ReactNode }) => (
  <div className="text-xs text-white/50">{children}</div>
);

const ToggleRow = ({label, hint, checked, onChange}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <SidebarSettingRow>
    <Toggle isChecked={Boolean(checked)} onChange={onChange}/>
    <div className="min-w-0">
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
           onChange={(event) => onChange(event.target.valueAsNumber)}/>
  </div>
);

const ColorRow = ({label, color, onChange}: { label: string; color: string; onChange: (color: string) => void }) => (
  <div className="flex flex-row items-center gap-3 text-sm text-white/85">
    <PopoverPicker color={color} onChange={onChange}/>
    {label}
  </div>
);

const LearningFileButtons = ({lang}: { lang: string }) => {
  const saveLearning = useCallback(() => {
    window.ipc.invoke('loadLearningState', lang).then((val) => {
      window.ipc.invoke("saveFile", ["json"], JSON.stringify(val))
    })
  }, [lang]);
  const loadLearning = useCallback(() => {
    window.ipc.invoke("readFile", ["json"]).then((val) => {
      try {
        window.ipc.invoke("updateContentBatch", JSON.parse(val), lang)
      } catch (e) {
        console.error(e)
      }
    })
  }, [lang]);
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
        <ToggleRow label="Show simplified characters" hint="Converts traditional-character subtitles."
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
export const SubtitleLookSettings = ({subtitleStyling, setSubtitleStyling, defaultStyling, name, withMeaning}: {
  subtitleStyling: CJKStyling;
  setSubtitleStyling: (styling: CJKStyling) => void;
  defaultStyling: CJKStyling;
  name: string;
  withMeaning: boolean;
}) => {
  const update = useStylingUpdate(subtitleStyling, setSubtitleStyling);
  const exportStyle = useCallback(() => {
    window.ipc.invoke("saveFile", ["json"], JSON.stringify(subtitleStyling))
  }, [subtitleStyling]);
  const importStyle = useCallback(() => {
    window.ipc.invoke("readFile", ["json"]).then((val) => {
      try {
        setSubtitleStyling(JSON.parse(val) as CJKStyling)
      } catch (e) {
        console.error(e)
      }
    })
  }, [setSubtitleStyling]);
  const resetStyle = useCallback(() => {
    if (window.confirm(`Reset the ${name} subtitle style to the defaults?`)) setSubtitleStyling(defaultStyling);
  }, [defaultStyling, name, setSubtitleStyling]);
  return <div className="flex flex-col gap-3">
    <div className="flex flex-row items-center gap-3 text-sm text-white/85">
      Font
      <input className={SIDEBAR_FIELD_INPUT} aria-label="Font" value={subtitleStyling.text.fontFamily}
             onChange={(event) => update("text.fontFamily", event.target.value)}/>
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
export const StylingBox = ({subtitleStyling, setSubtitleStyling, subtitleName, defaultStyling, lang}) => {
  const primary = subtitleName === "CJK";
  return <div className="w-full min-w-0 flex flex-col content-start gap-3 unselectable text-sm text-white/85">
    {primary && <SubtitleContentSettings subtitleStyling={subtitleStyling} setSubtitleStyling={setSubtitleStyling}
                                         lang={lang}/>}
    {primary && <LearningFileButtons lang={lang}/>}
    <SubtitleLookSettings subtitleStyling={subtitleStyling} setSubtitleStyling={setSubtitleStyling}
                          defaultStyling={defaultStyling} name={primary ? "primary" : "secondary"}
                          withMeaning={primary}/>
  </div>;
};

type SettingsTab = "playback" | "subtitles" | "look" | "data";

const TABS: { id: SettingsTab; label: string }[] = [
  {id: "playback", label: "Playback"},
  {id: "subtitles", label: "Subtitles"},
  {id: "look", label: "Look"},
  {id: "data", label: "Data"},
];

const Segmented = <T extends string>({options, value, onChange, label}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) => (
  <div role="tablist" aria-label={label} className="flex w-full gap-1 rounded-xl bg-black/30 p-1">
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        role="tab"
        aria-selected={value === option.id}
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
                          setShowLyricsSearch
                        }) => {
  const {exportAllAnkiCards, ankiExportModal} = useExportAllAnkiCards({lang, tokenizeMiteiru});
  const [tab, setTab] = useState<SettingsTab>("playback");
  const [lookTarget, setLookTarget] = useState<"primary" | "secondary">("primary");
  const usesToneNumbers = lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang;
  const exportHufHandler = useCallback(() => {
    if (!primarySub || !primarySub.lines || primarySub.lines.length === 0) {
      alert('No primary subtitle loaded to export.');
      return;
    }

    try {
      const hufContent = primarySub.toHufString();
      window.ipc.invoke("saveFile", ["huf", "json"], hufContent);
    } catch (error) {
      console.error('Failed to export HUF:', error);
      alert(`Failed to export HUF: ${error.message || 'Unknown error'}`);
    }
  }, [primarySub]);
  const isKaraoke = subtitleMode == SubtitleMode.Karaoke;
  return <>
    {ankiExportModal}
    <SidebarShell
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        title="Video settings"
        subtitle="Press X to open or close"
    >
      <Segmented<SettingsTab> options={TABS} value={tab} onChange={setTab} label="Settings sections"/>

      {tab === "playback" && <SidebarSection>
        <ToggleRow label="Pause after each line" hint="Stops at the end of every line, for shadowing or reading."
                   checked={autoPause} onChange={setAutoPause}/>
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
      </SidebarSection>}

      {tab === "subtitles" && <>
        <SidebarSection title="Primary subtitle">
          <SubtitleContentSettings subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                                   lang={lang}/>
        </SidebarSection>
        <SidebarSection title="Words to learn">
          <SliderRow label="Treat the most common words as mastered" valueLabel={`top ${learningPercentage}%`}
                     min={0} max={100} step={0.4} value={learningPercentage} onChange={setLearningPercentage}/>
          <Hint>Words you have not marked yet that are this common in the subtitle show as mastered, so the
            rarer ones stand out.</Hint>
        </SidebarSection>
      </>}

      {tab === "look" && <SidebarSection>
        <Segmented<"primary" | "secondary"> options={[{id: "primary", label: "Primary"}, {id: "secondary", label: "Secondary"}]}
                   value={lookTarget} onChange={setLookTarget} label="Subtitle to style"/>
        {lookTarget === "primary"
          ? <SubtitleLookSettings key="primary" subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                                  defaultStyling={defaultPrimarySubtitleStyling} name="primary" withMeaning/>
          : <SubtitleLookSettings key="secondary" subtitleStyling={secondaryStyling}
                                  setSubtitleStyling={setSecondaryStyling}
                                  defaultStyling={defaultSecondarySubtitleStyling} name="secondary"
                                  withMeaning={false}/>}
      </SidebarSection>}

      {tab === "data" && <>
        <SidebarSection title="Learning progress">
          <Hint>How well you know each word, for backups or another computer.</Hint>
          <LearningFileButtons lang={lang}/>
        </SidebarSection>
        <SidebarSection title="Anki">
          <Button type="secondary" className="w-full min-w-0 max-w-full" onPress={exportAllAnkiCards}>
            Export all Anki cards…
          </Button>
        </SidebarSection>
        <SidebarSection title="Primary subtitle">
          <Button type="secondary" className="w-full min-w-0 max-w-full" onPress={exportHufHandler}>
            Save as lyrics (.huf)…
          </Button>
          <Hint>Miteiru’s lyrics format, with the word splits and readings.</Hint>
        </SidebarSection>
        <SidebarSection title="Sync with a GitHub Gist">
          <GistManager lang={lang}/>
        </SidebarSection>
      </>}
    </SidebarShell>
  </>;
};
