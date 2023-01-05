import {isMixedJapanese} from "shunou";
import parse from "html-react-parser";
import styled from "styled-components";
import {CJKStyling} from "../utils/CJKStyling";
import {useEffect, useState} from "react";


export const Sentence = ({
                           origin,
                           setMeaning,
                           separation,
                           addRomaji = true,
                           addHiragana = true,
                           extraClass,
                           subtitleStyling
                         }: {
                           origin: string,
                           setMeaning: any,
                           separation: any,
                           addRomaji?: boolean,
                           addHiragana?: boolean,
                           extraClass: string,
                           subtitleStyling: CJKStyling
                         }
) => {
  const [StyledSentence, setStyledSentence] = useState(styled.button`
    &:hover {
      -webkit-text-fill-color: ${subtitleStyling.text.hoverColor};
      -webkit-text-stroke-color: ${subtitleStyling.stroke.hoverColor};
    }
  `)
  useEffect(() => {
    setStyledSentence(styled.button`
        &:hover {
          -webkit-text-fill-color: ${subtitleStyling.text.hoverColor};
          -webkit-text-stroke-color: ${subtitleStyling.stroke.hoverColor};
        }
      `)
  }, [subtitleStyling])
  const handleChange = (origin) => {
    setMeaning(origin)
  }
  return <StyledSentence className={extraClass} onClick={() => handleChange(origin)}>
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
      const showFurigana = (val.isKana || val.isKanji || val.isMixed || isMixedJapanese(origin));
      return <ruby style={{rubyPosition: "under"}} key={index}>
        <ruby style={{rubyPosition: "over"}}>
          {val.main}
          {showFurigana && addHiragana && hiragana}
        </ruby>
        {showFurigana && addRomaji && romaji}
      </ruby>
    })}
  </StyledSentence>
}

export const PlainSentence = ({origin}) => {
  return <div>{parse(origin)}</div>
}
