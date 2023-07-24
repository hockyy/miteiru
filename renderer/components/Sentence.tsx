import parse from "html-react-parser";
import styled from "styled-components";
import {CJKStyling} from "../utils/CJKStyling";
import React, {useCallback} from "react";
import {randomUUID} from "crypto";
import {isMixed} from "wanakana"

const StyledSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  &:hover, &:hover ruby, &:hover rt {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }
`

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
    navigator.clipboard.writeText(origin);
    setMeaning(origin)
  }, [setMeaning]);
  return <StyledSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={() => handleChange(origin)}>
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
        const showHelp = val.isKanji || val.isMixed || isMixed(origin);
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
      <rt className={"unselectable"}>{
          subtitleStyling.showMeaning
          && wordMeaning.length <= subtitleStyling.maximalMeaningLengthPerCharacter * origin.length
          && wordMeaning}</rt>

    </ruby>
  </StyledSentence>
}

export const PlainSentence = ({origin}) => {
  return <div key={randomUUID()}>{parse(origin)}</div>
}
