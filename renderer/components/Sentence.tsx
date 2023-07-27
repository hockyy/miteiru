import parse from "html-react-parser";
import styled from "styled-components";
import {CJKStyling} from "../utils/CJKStyling";
import React, {useCallback} from "react";
import {randomUUID} from "crypto";
import {isMixed, toRomaji} from "wanakana"

const StyledSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  &:hover, &:hover ruby, &:hover rt {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }
`

interface SentenceParam {
  origin: string,
  setMeaning: any,
  separation: any,
  extraClass: string,
  subtitleStyling: CJKStyling,
  wordMeaning?: string,
  basicForm?: string
}

export const Sentence = ({
                           origin, setMeaning, separation, extraClass,
                           subtitleStyling, basicForm = '', wordMeaning = '',
                         }: SentenceParam) => {
  const handleChange = useCallback((origin) => {
    navigator.clipboard.writeText(origin);
    setMeaning(origin)
  }, [setMeaning]);
  return <StyledSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={() => {
        handleChange(basicForm === '' ? origin : basicForm)
      }}>
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
              <rt>{val.romaji != '' ? val.romaji : toRomaji(val.main)}</rt>
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

export const KanjiSentence = ({
                                origin, setMeaning, separation,
                                extraClass, subtitleStyling,
                              }: SentenceParam) => {
  const handleChange = useCallback((newWord) => {
    navigator.clipboard.writeText(newWord);
    console.log(newWord)
  }, [setMeaning]);
  return <>
    {separation.map((val, index) => {
      const hiragana = (<>
            <rp>(</rp>
            <rt>{val.hiragana ?? ''}</rt>
            <rp>)</rp>
          </>
      )
      const showHelp = val.isKanji || val.isMixed || isMixed(origin);
      const showFurigana = ((val.isKana && subtitleStyling.showFuriganaOnKana) || showHelp);
      return <ruby style={{
        rubyPosition: "under",
        WebkitTextFillColor: subtitleStyling.text.color,
      }} key={index}>
        <ruby style={{rubyPosition: "over"}}>
          {Array.from(val.main).map(char => {
            return <StyledSentence
                subtitleStyling={subtitleStyling}
                className={extraClass}
                onClick={() => {
                  handleChange(char)
                }}><>{char}</>
            </StyledSentence>
          })}
          <rt className={"unselectable"}>{subtitleStyling.showFurigana && showFurigana && hiragana}</rt>
        </ruby>
      </ruby>
    })}
  </>
}