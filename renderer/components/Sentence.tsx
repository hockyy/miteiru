import parse from "html-react-parser";
import {CJKStyling} from "../utils/CJKStyling";
import React, {useCallback} from "react";
import uuid from "uuid-random"


export const Sentence = ({
                           origin,
                           setMeaning,
                           separation,
                           extraClass,
                           subtitleStyling,
                           wordMeaning = ''
                         }: {
                           origin: string,
                           setMeaning: any,
                           separation: any,
                           extraClass: string,
                           subtitleStyling: CJKStyling,
                           wordMeaning?: string
                         }
) => {
  const handleChange = useCallback((origin) => {
    setMeaning(origin)
  }, [setMeaning]);
  return <div>
    <ruby style={{
      rubyPosition: subtitleStyling.positionMeaningTop ? "over" : "under",
      WebkitTextFillColor: wordMeaning ? subtitleStyling.textMeaning.color : '',
      WebkitTextStrokeColor: subtitleStyling.stroke.color,
      WebkitTextStrokeWidth: subtitleStyling.stroke.width,
    }}>
      {separation.map((val, index) => {
        const hiragana = (<>
              <rp>(</rp>
              <rt>{val.hiragana ?? ''}</rt>
              <rp>)</rp>
            </>
        )
        const romaji = (<>
              <rp>(</rp>
              <rt>{val.romaji ?? ''}</rt>
              <rp>)</rp>
            </>
        )
        const showHelp = val.isKanji || val.isMixed;
        const showRomaji = (val.isKana || showHelp);
        const showFurigana = ((val.isKana && subtitleStyling.showFuriganaOnKana) || showHelp);
        return <ruby style={{
          rubyPosition: "under",
          WebkitTextFillColor: subtitleStyling.text.color,
        }} key={index}>
          <ruby style={{rubyPosition: "over"}}>
            {val.main}
            <rt className={"unselectable"}>{subtitleStyling.showFurigana && showFurigana && hiragana}</rt>
          </ruby>
          <rt className={"unselectable"}>{subtitleStyling.showRomaji && showRomaji && romaji}</rt>
        </ruby>
      })}
      <rt className={"unselectable"}>{subtitleStyling.showMeaning && wordMeaning}</rt>

    </ruby>
  </div>
}

export const PlainSentence = ({origin}) => {
  return <div key={uuid()}>{parse(origin)}</div>
}
