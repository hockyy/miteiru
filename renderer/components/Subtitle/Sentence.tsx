import parse from "html-react-parser";
import styled from "styled-components";
import {CJKStyling, defaultLearningColorStyling} from "../../utils/CJKStyling";
import React, {useCallback, useEffect} from "react";
import {randomUUID} from "crypto";
import {isMixed, toRomaji} from "wanakana"

const StyledSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  ruby {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.color};
  }

  .state0 {
    -webkit-text-fill-color: ${props => props.subtitleStyling.learning ?
            defaultLearningColorStyling.learningColor[0].color : props.subtitleStyling.text.color};
  }

  .state1 {
    -webkit-text-fill-color: ${props => props.subtitleStyling.learning ?
            defaultLearningColorStyling.learningColor[1].color : props.subtitleStyling.text.color};
  }

  .state2 {
    -webkit-text-fill-color: ${props => props.subtitleStyling.learning ?
            defaultLearningColorStyling.learningColor[2].color : props.subtitleStyling.text.color};
  }

  &:hover .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover, &:hover ruby {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover rt.internalMeaning {
    -webkit-text-fill-color: ${props => props.subtitleStyling.textMeaning?.hoverColor ?? props.subtitleStyling.text.hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }
`

const StyledChineseSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  ruby {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.color};
  }

  .state0 {
    -webkit-text-fill-color: ${props => props.subtitleStyling.learning ?
            defaultLearningColorStyling.learningColor[0].color : props.subtitleStyling.text.color};
  }

  .state1 {
    -webkit-text-fill-color: ${props => props.subtitleStyling.learning ?
            defaultLearningColorStyling.learningColor[1].color : props.subtitleStyling.text.color};
  }

  .state2 {
    -webkit-text-fill-color: ${props => props.subtitleStyling.learning ?
            defaultLearningColorStyling.learningColor[2].color : props.subtitleStyling.text.color};
  }

  &:hover .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover ruby, &:hover rt {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

  &:hover rt.internalMeaning {
    -webkit-text-fill-color: ${props => props.subtitleStyling.textMeaning?.hoverColor ?? props.subtitleStyling.text.hoverColor};
    -webkit-text-stroke-color: ${props => props.subtitleStyling.stroke.hoverColor};
  }

`

interface SentenceParam {
  origin: string,
  setMeaning: any,
  separation?: any,
  extraClass: string,
  subtitleStyling: CJKStyling,
  wordMeaning?: string,
  basicForm?: string,
  checkLearningState?: any,
  changeLearningState?: any,
}

export const JapaneseSentence = ({
                                   origin, setMeaning, separation, extraClass,
                                   subtitleStyling, basicForm = '', wordMeaning = '',
                                   changeLearningState,
                                   checkLearningState
                                 }: SentenceParam) => {
  const handleChange = useCallback((pressedString) => {
    navigator.clipboard.writeText(pressedString);
    setMeaning(pressedString)
  }, [setMeaning]);

  const handleClick = useCallback((e) => {
    changeLearningState(basicForm);
    handleChange(e.shiftKey ? origin : basicForm);
  }, [handleChange, changeLearningState, checkLearningState]);

  return <StyledSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={handleClick}>
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
        }} key={index}>
          <ruby className={`state${checkLearningState(origin)}`} style={{rubyPosition: "over"}}>
            {val.main}
            <rt className={"unselectable"}>{subtitleStyling.showFurigana && showFurigana && hiragana}</rt>
          </ruby>
          <rt className={"unselectable"}>{subtitleStyling.showRomaji && showRomaji && romaji}</rt>
        </ruby>
      })}
      <rt style={{fontWeight: subtitleStyling.textMeaning.weight}}
          className={"internalMeaning unselectable"}>{
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
    setMeaning(newWord)
  }, [setMeaning]);
  return <>
    {separation.map((val, index) => {
      const hiragana = (<>
            <rp>(</rp>
            <rt>{val.hiragana ?? ''}</rt>
            <rp>)</rp>
          </>
      )
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
          <rt className={"unselectable"}>{hiragana}</rt>
        </ruby>
      </ruby>
    })}
  </>
}


export const HanziSentence = ({
                                origin, setMeaning,
                                extraClass, subtitleStyling,
                              }: SentenceParam) => {
  const handleChange = useCallback((newWord) => {
    navigator.clipboard.writeText(newWord);
    setMeaning(newWord)
  }, [setMeaning]);
  return <><StyledSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={() => {
        handleChange(origin)
      }}><>{origin}</>
  </StyledSentence>
  </>
}


export const ChineseSentence = ({
                                  origin,
                                  setMeaning,
                                  separation,
                                  extraClass,
                                  subtitleStyling,
                                  basicForm = '',
                                  wordMeaning = '',
                                  changeLearningState,
                                  checkLearningState
                                }: SentenceParam) => {
  const handleChange = useCallback((pressedString) => {
    navigator.clipboard.writeText(pressedString);
    setMeaning(pressedString)
  }, [setMeaning]);
  const handleClick = useCallback(() => {
    changeLearningState(origin);
    handleChange(origin);
  }, [handleChange, changeLearningState]);
  return <StyledChineseSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={handleClick}>
    <ruby style={{
      rubyPosition: subtitleStyling.positionMeaningTop ? "over" : "under",
      WebkitTextFillColor: wordMeaning ? subtitleStyling.textMeaning.color : '',
      WebkitTextStrokeColor: subtitleStyling.stroke.color,
      WebkitTextStrokeWidth: subtitleStyling.stroke.width,
    }}>
      {separation.map((val, index) => {
        return <ruby className={`state${checkLearningState(origin)}`} style={{
          rubyPosition: "over",
        }} key={index}>
          {val.main}
          <rt className={"unselectable"}>{subtitleStyling.showFurigana && (val.jyutping ?? val.pinyin)}</rt>
        </ruby>
      })}
      <rt style={{fontWeight: subtitleStyling.textMeaning.weight}}
          className={"internalMeaning unselectable"}>{
          subtitleStyling.showMeaning
          && wordMeaning.length <= subtitleStyling.maximalMeaningLengthPerCharacter * origin.length
          && wordMeaning}</rt>

    </ruby>
  </StyledChineseSentence>
}