import {isMixedJapanese} from "shunou";
import parse from "html-react-parser";
import styled from "styled-components";
import {CJKStyling} from "../utils/CJKStyling";
import React from "react";
import {randomUUID} from "crypto";

const StyledSentence = styled.button`
  &:hover {
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
  const handleChange = (origin) => {
    setMeaning(origin)
  }
  return <StyledSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={() => handleChange(origin)}>
    <ruby style={{rubyPosition: "under"}}>
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
        const showHelp = val.isKanji || val.isMixed || isMixedJapanese(origin);
        const showRomaji = (val.isKana || showHelp);
        const showFurigana = ((val.isKana && subtitleStyling.showFuriganaOnKana) || showHelp);
        return <ruby style={{rubyPosition: "under"}} key={index}>
          <ruby style={{rubyPosition: "over"}}>
            {val.main}
            <rt className={"unselectable"}>{subtitleStyling.showFurigana && showFurigana && hiragana}</rt>
          </ruby>
          <rt className={"unselectable"}>{subtitleStyling.showRomaji && showRomaji && romaji}</rt>
        </ruby>
      })}
      <rt className={"unselectable"}>{subtitleStyling.showMeaning && wordMeaning}</rt>

    </ruby>
  </StyledSentence>
}

export const PlainSentence = ({origin}) => {
  return <div key={randomUUID()}>{parse(origin)}</div>
}
