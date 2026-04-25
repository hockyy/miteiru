import React, {useCallback} from "react";
import {PopoverPicker} from "./PopoverPicker";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling
} from "../../utils/CJKStyling";
import Toggle from "./Toggle";
import {AwesomeButton} from "react-awesome-button";
import {GistManager} from "../Data/GistManager";
import {SubtitleMode} from "../../utils/utils";
import {SidebarSection, SidebarSettingRow, SidebarShell} from "./SidebarShell";

export const StylingBox = ({
                             subtitleStyling,
                             setSubtitleStyling,
                             subtitleName,
                             defaultStyling,
                             lang
                           }) => {
  const saveHandler = useCallback(() => {
    window.ipc.invoke("saveFile", ["json"], JSON.stringify(subtitleStyling))
  }, [subtitleStyling]);
  const loadHandler = useCallback(() => {
    window.ipc.invoke("readFile", ["json"]).then((val) => {
      try {
        const parsed = JSON.parse(val) as CJKStyling;
        setSubtitleStyling(parsed)
      } catch (e) {
        console.error(e)
      }
    })
  }, [setSubtitleStyling]);
  const cjkForceSimplifiedHandler = useCallback((val) => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.forceSimplified = val;
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const cjkShowFuriganaHandler = useCallback((val) => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.showFurigana = val;
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const cjkShowFuriganaOnKanaHandler = useCallback((val) => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.showFuriganaOnKana = val;
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const cjkShowRomajiHandler = useCallback((val) => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.showRomaji = val;
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const cjkShowMeaningHandler = useCallback((val) => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.showMeaning = val;
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const cjkUseLearningHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.learning = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const cjkTextMeaningColorHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.textMeaning.color = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const cjkShowMoreSpaceHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.showSpace = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const cjkMeaningHoverTextHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.textMeaning.hoverColor = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const cjkMeaningWeightHandler = useCallback(event => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.textMeaning.weight = parseInt(event.target.value);
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const cjkRemoveHearingImpairedHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.removeHearingImpaired = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const cjkSubtitleMeaningTopHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.positionMeaningTop = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const cjkMaximalMeaningLPCHandler = useCallback(event => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.maximalMeaningLengthPerCharacter = parseInt(event.target.value);
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const subtitleTextColorHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.text.color = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const subtitleHoverColorHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.text.hoverColor = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const subtitleStrokeColorHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.stroke.color = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const subtitleHoverStrokeColorHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.stroke.hoverColor = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const subtitlePositionFromTopHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.positionFromTop = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);
  const backgroundColorHandler = useCallback((val) => {
        const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
        newCopy.background = val;
        setSubtitleStyling(newCopy)
      }
      , [setSubtitleStyling, subtitleStyling]);

  const subtitleFontFamilyHandler = useCallback((event) => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.text.fontFamily = event.target.value;
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const fontWeightHandler = useCallback(event => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.text.weight = parseInt(event.target.value);
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const fontSizeHandler = useCallback(event => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.text.fontSize = event.target.value + "px";
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const positionFromTopSlideHandler = useCallback(event => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.position = event.target.value + "vh";
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const strokeWidthHandler = useCallback(event => {
    const newCopy = JSON.parse(JSON.stringify(subtitleStyling))
    newCopy.stroke.width = event.target.value + "px";
    setSubtitleStyling(newCopy)
  }, [setSubtitleStyling, subtitleStyling]);
  const saveLearningHandler = useCallback(() => {
    window.ipc.invoke('loadLearningState', lang).then((val) => {
      window.ipc.invoke("saveFile", ["json"], JSON.stringify(val))
    })
  }, [lang]);

  const loadLearningHandler = useCallback(() => {
    window.ipc.invoke("readFile", ["json"]).then((val) => {
      try {
        const parsed = JSON.parse(val);
        window.ipc.invoke("updateContentBatch", parsed, lang)
      } catch (e) {
        console.error(e)
      }
    })
  }, [lang]);
  return <div className={"w-full flex flex-col content-start gap-3 unselectable text-sm text-white/85"}>
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.showFurigana} onChange={cjkShowFuriganaHandler}/>
      {subtitleName} Show Furigana
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.forceSimplified} onChange={cjkForceSimplifiedHandler}/>
      {subtitleName} Force Simplified ZH
    </div>}
    {subtitleName == "CJK" && subtitleStyling.showFurigana &&
        <div className={"flex flex-row items-center gap-3"}>
          <Toggle isChecked={subtitleStyling.showFuriganaOnKana}
                  onChange={cjkShowFuriganaOnKanaHandler}/>
          {subtitleName} Show Furigana on Kana
        </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.showRomaji} onChange={cjkShowRomajiHandler
      }/>
      {subtitleName} Show Romaji
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.showMeaning} onChange={cjkShowMeaningHandler
      }/>
      {subtitleName} Show Meaning
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.learning} onChange={cjkUseLearningHandler}/>
      {subtitleName} Use learning styling
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row gap-2 w-full"}>
      <AwesomeButton
          type={"primary"}
          className={"w-full"}
          onPress={saveLearningHandler}>Save Learning</AwesomeButton>
      <AwesomeButton
          type={"secondary"}
          className={"w-full"}
          onPress={loadLearningHandler}>Load Learning</AwesomeButton>
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.showSpace} onChange={cjkShowMoreSpaceHandler}/>
      {subtitleName} Show More Space Between Each Token
    </div>}
    <div className={"flex flex-row items-center gap-3"}>
      Font Family &nbsp;
      <input
          className={"p-3 text-black"}
          value={subtitleStyling.text.fontFamily}
          onChange={subtitleFontFamilyHandler}
      />
    </div>
    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.text.color} onChange={subtitleTextColorHandler}/>
      {subtitleName} Subtitle Text Color
    </div>
    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.text.hoverColor} onChange={subtitleHoverColorHandler}/>
      {subtitleName} Subtitle Hover Color
    </div>

    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.stroke.color} onChange={subtitleStrokeColorHandler}/>
      {subtitleName} Subtitle Stroke Color
    </div>
    <div className={"flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.stroke.hoverColor}
                     onChange={subtitleHoverStrokeColorHandler}/>
      {subtitleName} Subtitle Hover Stroke Color
    </div>

    {subtitleName == "CJK" &&
        <div className={"flex flex-row items-center gap-3"}>
          <PopoverPicker color={subtitleStyling.textMeaning.color}
                         onChange={cjkTextMeaningColorHandler}/>
          {subtitleName} Meaning Text Color
        </div>}
    {subtitleName == "CJK" &&
        <div className={"flex flex-row items-center gap-3"}>
          <PopoverPicker color={subtitleStyling.textMeaning.hoverColor}
                         onChange={cjkMeaningHoverTextHandler}/>
          {subtitleName} Meaning Hover Text Color
        </div>}

    {subtitleName == "CJK" &&
        <div className={"flex w-full justify-center items-center"}>
          Meaning Font Weight <span>{subtitleStyling.textMeaning.weight}</span> &nbsp;
          <input
              className={"slider"}
              type="range"
              min={100}
              max={800}
              step={100}
              value={parseInt(subtitleStyling.textMeaning.weight)}
              onChange={cjkMeaningWeightHandler}
          />
        </div>}
    <div className={"w-full flex flex-row items-center gap-3"}>
      <PopoverPicker color={subtitleStyling.background} onChange={backgroundColorHandler}/>
      {subtitleName} Background Color
    </div>
    <div className={"flex w-full justify-center items-center"}>
      Stroke Width <span>{subtitleStyling.stroke.width}</span> &nbsp;
      <input
          className={"slider"}
          type="range"
          min={0}
          max={1.5}
          step={0.02}
          value={parseFloat(subtitleStyling.stroke.width.trim('px'))}
          onChange={strokeWidthHandler}
      />
    </div>
    <div className={"flex w-full justify-center items-center"}>
      Font Size <span>{subtitleStyling.text.fontSize}</span> &nbsp;
      <input
          className={"slider"}
          type="range"
          min={10}
          max={100}
          step={1}
          value={parseInt(subtitleStyling.text.fontSize.trim('px'))}
          onChange={fontSizeHandler}
      />
    </div>

    <div className={"flex w-full justify-center items-center"}>
      Font Weight <span>{subtitleStyling.text.weight}</span> &nbsp;
      <input
          className={"slider"}
          type="range"
          min={100}
          max={800}
          step={100}
          value={parseInt(subtitleStyling.text.weight)}
          onChange={fontWeightHandler}
      />
    </div>
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.removeHearingImpaired}
              onChange={cjkRemoveHearingImpairedHandler}/>
      Remove Hearing Impaired
    </div>}
    <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.positionFromTop}
              onChange={subtitlePositionFromTopHandler}/>
      {subtitleName} Subtitle Position from Top
    </div>
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      <Toggle isChecked={subtitleStyling.positionMeaningTop}
              onChange={cjkSubtitleMeaningTopHandler}/>
      {subtitleName} Subtitle Meaning at Top
    </div>}
    {subtitleName == "CJK" && <div className={"flex flex-row items-center gap-3"}>
      Max Meaning Length/Character <span>{subtitleStyling.maximalMeaningLengthPerCharacter}</span>
      <input
          className={"slider"}
          type="range"
          min={0}
          max={20}
          step={1}
          value={parseInt(subtitleStyling.maximalMeaningLengthPerCharacter)}
          onChange={cjkMaximalMeaningLPCHandler}
      />
    </div>}
    <div className={"flex w-full justify-center items-center"}>
      Position from {subtitleStyling.positionFromTop ? 'top' : 'bottom'}
      <input
          className={"slider"}
          type="range"
          min={0}
          max={100}
          step={1}
          value={parseInt(subtitleStyling.position.trim('vh'))}
          onChange={positionFromTopSlideHandler}
      />
    </div>
    <AwesomeButton
        type={"danger"}
        onPress={() => {
          setSubtitleStyling(defaultStyling)
        }}
    >Reset</AwesomeButton>
    <div className={"flex flex-row gap-2 w-full"}>
      <AwesomeButton
          type={"primary"}
          className={"w-full"}
          onPress={loadHandler}>Import</AwesomeButton>
      <AwesomeButton
          type={"secondary"}
          className={"w-full"}
          onPress={saveHandler}>Export
      </AwesomeButton>
    </div>
  </div>
}

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
                          subtitleMode,
                          setSubtitleMode
                        }) => {
  const learningPercentageHandler = useCallback(event => {
    setLearningPercentage(parseFloat(event.target.value));
  }, [setLearningPercentage])
  const autoPauseHandler = useCallback((val) => {
    setAutoPause(val);
  }, [setAutoPause])
  const toneTypeHandler = useCallback((val) => {
    setToneType(val ? 'num' : 'symbol');
  }, [setToneType])
  const subtitleModeHandler = useCallback((val) => {
    setSubtitleMode(val ? SubtitleMode.Karaoke : SubtitleMode.Normal);
  }, [setSubtitleMode])
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
  return <SidebarShell
      showSidebar={showSidebar}
      setShowSidebar={setShowSidebar}
      title="Video Settings"
      subtitle="Playback, learning, subtitle style, and data tools"
  >
    <SidebarSection title="Playback">
      <SidebarSettingRow>
        <Toggle isChecked={toneType === 'num'} onChange={toneTypeHandler}/>
        Use {toneType} Tone Type
      </SidebarSettingRow>
      <SidebarSettingRow>
        <Toggle isChecked={autoPause} onChange={autoPauseHandler}/>
        Enable Auto Pause
      </SidebarSettingRow>
      <SidebarSettingRow>
        <Toggle isChecked={subtitleMode == SubtitleMode.Karaoke} onChange={subtitleModeHandler}/>
        Use Karaoke Mode
      </SidebarSettingRow>
      <div className={"flex w-full items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm text-white/85"}>
        <span>Learning </span>
        <span className={'inline-block w-14'}>{learningPercentage}%</span>
        <span className={'inline-block w-1/2'}><input
            className={"slider"}
            type="range"
            min={0}
            max={100}
            step={0.4}
            value={learningPercentage}
            onChange={learningPercentageHandler}
        /></span>
      </div>
      <AwesomeButton
            type={"secondary"}
            className={"w-full"}
            onPress={exportHufHandler}>Export Primary as HUF</AwesomeButton>
    </SidebarSection>

    <SidebarSection title="Primary Subtitle">
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                subtitleName={"CJK"} defaultStyling={defaultPrimarySubtitleStyling} lang={lang}/>
    </SidebarSection>
    <SidebarSection title="Secondary Subtitle">
    <StylingBox subtitleStyling={secondaryStyling} setSubtitleStyling={setSecondaryStyling}
                subtitleName={"Other"} defaultStyling={defaultSecondarySubtitleStyling}
                lang={lang}/>
    </SidebarSection>
    <SidebarSection title="Cloud Sync">
      <GistManager lang={lang}/>
    </SidebarSection>
  </SidebarShell>
}