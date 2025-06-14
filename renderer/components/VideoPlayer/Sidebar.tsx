import {ArrowLeft} from "./Icons";
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
  return <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable"}>
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

    <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable"}>
      <div className={"flex flex-row items-center gap-3"}>
        <Toggle isChecked={toneType === 'num'} onChange={toneTypeHandler}/>
        Use {toneType} Tone Type
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <Toggle isChecked={autoPause} onChange={autoPauseHandler}/>
        Enable Auto Pause
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <Toggle isChecked={subtitleMode == SubtitleMode.Karaoke} onChange={subtitleModeHandler}/>
        Use Karaoke Mode
      </div>
      <div className={"flex w-full justify-around items-center gap-3"}>
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
    </div>

    <hr className={"w-full h-1 m-5"}/>
    <StylingBox subtitleStyling={primaryStyling} setSubtitleStyling={setPrimaryStyling}
                subtitleName={"CJK"} defaultStyling={defaultPrimarySubtitleStyling} lang={lang}/>
    <hr className={"w-full h-1 m-5"}/>
    <StylingBox subtitleStyling={secondaryStyling} setSubtitleStyling={setSecondaryStyling}
                subtitleName={"Other"} defaultStyling={defaultSecondarySubtitleStyling}
                lang={lang}/>
    <div className={'w-full mt-4 mx-5 px-3 flex flex-col content-center gap-3'}>
      <GistManager lang={lang}/>
    </div>
  </div>
}