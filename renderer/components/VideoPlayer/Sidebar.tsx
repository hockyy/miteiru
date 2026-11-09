import React, {ReactNode, useCallback, useEffect, useState} from "react";
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
import {announceLearningStateChanged} from "../../utils/learningStateEvents";
import {rangeFillStyle, SubtitleMode} from "../../utils/utils";
import {SidebarSection, SidebarSettingRow, SidebarShell} from "./SidebarShell";
import {MANDARIN_TONE_PALETTES, type MandarinTone, type TonePalette, type ToneTarget} from "../../utils/mandarinTones";
import {HSK_COLORS, HSK_UNLISTED_COLOR, hskLabel, type HskLevel} from "../../utils/mandarinHsk";
import {OpenRouterSettings} from "./OpenRouterSettings";
import {AiUsageDetails} from "./AiCostIndicator";
import type {useSubtitleForecast} from "../../hooks/useSubtitleForecast";
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

const ToggleRow = ({label, hint, checked, onChange, disabled = false}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Dimmed and not clickable. */
  disabled?: boolean;
}) => (
  <SidebarSettingRow>
    <Toggle isChecked={Boolean(checked)} onChange={onChange} label={label} disabled={disabled}/>
    {/* The text toggles too; the switch alone is a small target. Keyboard users use the switch. */}
    <div className={`min-w-0 flex-1 select-none ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
         aria-disabled={disabled || undefined}
         onClick={() => { if (!disabled) onChange(!checked); }}>
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
      if (saved !== false) announceLearningStateChanged(lang);
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

const TONE_TARGETS: { id: ToneTarget; label: string }[] =
  [{id: "hanzi", label: "Characters"}, {id: "pinyin", label: "Pinyin"}, {id: "both", label: "Both"}];
const TONE_PALETTE_OPTIONS: { id: TonePalette; label: string }[] =
  [{id: "default", label: "Standard"}, {id: "accessible", label: "Colour-blind safe"}];
const TONE_SAMPLES: [MandarinTone, string, string][] =
  [[1, "mā", "First tone"], [2, "má", "Second tone"], [3, "mǎ", "Third tone"], [4, "mà", "Fourth tone"], [5, "ma", "Neutral tone"]];
const HSK_KEY_LEVELS: HskLevel[] = [1, 2, 3, 4, 5, 6, 7];

// The slider's last stop is "all of 1–9": 7 and 8 alone would change nothing, since HSK 3.0 lists 7–9 as one band.
const hskSliderValue = (above = 0) => above >= 9 ? 7 : Math.min(Math.max(above, 0), 6);
const hskAboveFromSlider = (value: number) => value >= 7 ? 9 : value;
const knownLevelsLabel = (value: number) =>
  value === 0 ? "None" : value === 1 ? "HSK 1" : value >= 7 ? "HSK 1–9" : `HSK 1–${value}`;

/** Mandarin-only study aids: tone colours (#105) and HSK level underlines (#104). Options show only while switched on. */
const MandarinStudySettings = ({subtitleStyling, update}: {
  subtitleStyling: CJKStyling;
  update: (path: string, value: unknown) => void;
}) => {
  const target = subtitleStyling.mandarinToneTarget ?? "both";
  const palette = MANDARIN_TONE_PALETTES[subtitleStyling.mandarinTonePalette ?? "default"] ?? MANDARIN_TONE_PALETTES.default;
  const above = subtitleStyling.mandarinHskAbove ?? 0;
  return <>
    <ToggleRow label="Tone colours" hint="Each syllable takes the colour of the tone it's spoken with, so 一 and 不 change with the next word."
               checked={subtitleStyling.mandarinToneColors}
               onChange={(value) => update("mandarinToneColors", value)}/>
    {subtitleStyling.mandarinToneColors && <div className="ml-4 flex flex-col gap-3 border-l border-white/15 pl-3">
      <div className="flex flex-col gap-1.5">
        <div className="text-sm text-white/85">Colour</div>
        <Segmented<ToneTarget> group="tone-target" options={TONE_TARGETS} value={target}
                               onChange={(value) => update("mandarinToneTarget", value)} label="Colour"/>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-sm text-white/85">Colours</div>
        <Segmented<TonePalette> group="tone-palette" options={TONE_PALETTE_OPTIONS}
                                value={subtitleStyling.mandarinTonePalette ?? "default"}
                                onChange={(value) => update("mandarinTonePalette", value)} label="Colours"/>
      </div>
      <div className="flex gap-1" role="list" aria-label="Tone key">
        {TONE_SAMPLES.map(([tone, sample, name]) => (
          <span key={tone} role="listitem" aria-label={name} title={name}
                className="flex-1 rounded-lg bg-black/40 py-1 text-center text-base font-bold"
                style={{color: palette[tone]}}>{sample}</span>
        ))}
      </div>
      {subtitleStyling.learning && target !== "pinyin" &&
          <Hint>On the characters, tone colours take the place of learning colours.</Hint>}
    </div>}
    <ToggleRow label="HSK levels" hint="Underlines words by HSK 3.0 level. A dashed line means the word isn't on the list."
               checked={subtitleStyling.mandarinHsk}
               onChange={(value) => update("mandarinHsk", value)}/>
    {subtitleStyling.mandarinHsk && <div className="ml-4 flex flex-col gap-3 border-l border-white/15 pl-3">
      <SliderRow label="Levels you already know" valueLabel={knownLevelsLabel(hskSliderValue(above))}
                 min={0} max={7} step={1} value={hskSliderValue(above)}
                 onChange={(value) => update("mandarinHskAbove", hskAboveFromSlider(value))}/>
      <div className="flex flex-wrap gap-1" role="list" aria-label="HSK key">
        {HSK_KEY_LEVELS.map((level) => {
          const hidden = (level === 7 ? 9 : level) <= above;
          return <span key={level} role="listitem" aria-label={`${hskLabel(level)}${hidden ? ", hidden" : ""}`}
                       className={`rounded-lg bg-black/40 px-2 py-1 text-xs font-bold tabular-nums transition-opacity ${hidden ? "opacity-30" : ""}`}
                       style={{textDecoration: `underline 2px ${HSK_COLORS[level]}`, textUnderlineOffset: "3px"}}>
            {level === 7 ? "7–9" : level}
          </span>;
        })}
        <span role="listitem" className="rounded-lg bg-black/40 px-2 py-1 text-xs font-bold"
              style={{textDecoration: `underline dashed 2px ${HSK_UNLISTED_COLOR}`, textUnderlineOffset: "3px"}}>Not listed</span>
      </div>
      <Hint>HSK 3.0 lists levels 7–9 as one advanced band. The word popup shows each word&rsquo;s level.</Hint>
    </div>}
  </>;
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
    {lang === videoConstants.chineseLang && <MandarinStudySettings subtitleStyling={subtitleStyling} update={update}/>}
    <ToggleRow label="Show word meanings" checked={subtitleStyling.showMeaning}
               onChange={(value) => update("showMeaning", value)}/>
    {subtitleStyling.showMeaning && <>
      <ToggleRow label="Meanings above the words" checked={subtitleStyling.positionMeaningTop}
                 onChange={(value) => update("positionMeaningTop", value)}/>
      <SliderRow label="Longest meaning shown" valueLabel={`${subtitleStyling.maximalMeaningLengthPerCharacter} letters per character`}
                 min={0} max={20} step={1} value={Number(subtitleStyling.maximalMeaningLengthPerCharacter)}
                 onChange={(value) => update("maximalMeaningLengthPerCharacter", value)}/>
    </>}
    <ToggleRow label="Learning style" hint="Colour words by how well you know them."
               checked={subtitleStyling.learning}
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

export type SettingsTab = "playback" | "subtitles" | "look" | "ai" | "data";

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

/** What the AI Settings tab asks to be told about the AI study tools. */
export type AiStudyForecast = Pick<ReturnType<typeof useSubtitleForecast>,
  "tipsEnabled" | "setTipsEnabled" | "dictionaryEnabled" | "setDictionaryEnabled" | "lookahead" | "setLookahead" |
  "busy" | "error" | "retry" | "hasApiKey">;

const LOOKAHEADS: { id: "30" | "60"; label: string }[] = [{id: "30", label: "30 s"}, {id: "60", label: "1 min"}];

/** The status line under the AI tools: what the forecast is doing, or nothing when every tool is off. */
export const aiStudyStatus = (forecast: Pick<AiStudyForecast, "tipsEnabled" | "dictionaryEnabled" | "busy" | "error">) =>
  forecast.error ? "error" : forecast.busy ? "Preparing the next part…"
    : forecast.tipsEnabled || forecast.dictionaryEnabled ? "Ready. Finished parts are kept, so going back costs nothing." : "";

/** Settings → AI, after the OpenRouter key: the study tools, what they cost, and the user dictionary. */
export const AiStudySettings = ({forecast, dictionaryCount, onOpenDictionary}: {
  forecast: AiStudyForecast; dictionaryCount: number; onOpenDictionary: () => void;
}) => {
  const status = aiStudyStatus(forecast);
  return <>
    <SidebarSection title="While you watch">
      <ToggleRow label="Box tips" disabled={!forecast.hasApiKey && !forecast.tipsEnabled}
                 hint="A short note when the line on screen has grammar, wordplay or a saying worth knowing."
                 checked={forecast.tipsEnabled} onChange={forecast.setTipsEnabled}/>
      <ToggleRow label="AI word splitting" disabled={!forecast.hasApiKey && !forecast.dictionaryEnabled}
                 hint="AI checks where words begin and end and adds their meaning in this line. Words your dictionaries miss are saved to Your dictionary."
                 checked={forecast.dictionaryEnabled} onChange={forecast.setDictionaryEnabled}/>
      <div className="flex flex-col gap-2">
        <div className="text-sm text-white/85">Looks ahead</div>
        <Segmented<"30" | "60"> group="lookahead" options={LOOKAHEADS} value={forecast.lookahead === 60 ? "60" : "30"}
                                onChange={(value) => forecast.setLookahead(Number(value))} label="Looks ahead"/>
        <Hint>How much of the video each AI request covers. 30 s prepares the part you&rsquo;re watching first, then the next one.</Hint>
      </div>
      {!forecast.hasApiKey && <Hint>Add your OpenRouter key above to use these.</Hint>}
      {status === "error"
        ? <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-red-200">
          <span className="min-w-0 break-words">{forecast.error}</span>
          <Button type="secondary" size="small" onPress={forecast.retry}>Retry</Button>
        </div>
        : status && <div role="status" className="text-xs text-white/60">{status}</div>}
    </SidebarSection>
    <SidebarSection title="Spending">
      <AiUsageDetails/>
    </SidebarSection>
    <SidebarSection title="Your dictionary">
      <div>
        <div className="text-2xl font-black tabular-nums">{dictionaryCount} {dictionaryCount === 1 ? "word" : "words"}</div>
        <div className="mt-1 text-xs text-white/60">Words added by AI or by you, used on top of the built-in dictionary.</div>
      </div>
      <Button type="secondary" className="w-full min-w-0 max-w-full" onPress={onOpenDictionary}>Open your dictionary</Button>
    </SidebarSection>
  </>;
};

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
                          notify,
                          requestedTab,
                          forecast,
                          dictionaryCount,
                          onOpenDictionary
                        }: {
  requestedTab?: { tab: SettingsTab; nonce: number };
  forecast: AiStudyForecast;
  dictionaryCount: number;
  onOpenDictionary: () => void;
  [prop: string]: any;
}) => {
  const {exportAllAnkiCards, ankiExportModal} = useExportAllAnkiCards({lang, tokenizeMiteiru});
  const [tab, setTab] = useState<SettingsTab>("playback");
  // The top bar opens Settings on a given tab; each request (a new nonce) switches to it again.
  const requestedNonce = requestedTab?.nonce;
  useEffect(() => {
    if (requestedTab) setTab(requestedTab.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedNonce]);
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
        <AiStudySettings forecast={forecast} dictionaryCount={dictionaryCount} onOpenDictionary={onOpenDictionary}/>
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
