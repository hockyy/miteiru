import parse from "html-react-parser";
import styled from "styled-components";
import {CJKStyling, defaultLearningColorStyling} from "../../utils/CJKStyling";
import React, {ReactNode, useCallback, useEffect, useState} from "react";
import {isMixed, toRomaji} from "wanakana"
import {v4 as uuidv4} from 'uuid';


const StyledSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  ruby {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.color};
  }

  .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].color};
  }

  .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].color};
  }

  .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].color};
  }

  .state3 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[3].color};
  }

  &:hover .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].hoverColor};
  }

  &:hover .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].hoverColor};
  }

  &:hover .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].hoverColor};
  }

  &:hover .state3 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[3].hoverColor};
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
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].color};
  }

  .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].color};
  }

  .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].color};
  }

  .state3 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[3].color};
  }

  &:hover .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].hoverColor};
  }

  &:hover .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].hoverColor};
  }

  &:hover .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].hoverColor};
  }

  &:hover .state3 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[3].hoverColor};
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
  getLearningStateClass?: any,
  changeLearningState?: any,
  pinyin?: string[]
}

export const JapaneseSentence = ({
                                   origin,
                                   setMeaning,
                                   separation,
                                   extraClass,
                                   subtitleStyling,
                                   basicForm = '',
                                   wordMeaning = '',
                                   changeLearningState = () => '',
                                   getLearningStateClass = () => ''
                                 }: SentenceParam) => {
  const [separationContent, setSeparationContent] = useState([]);

  const [learningClassName, setLearningClassName] = useState('');
  useEffect(() => {
    if (!getLearningStateClass) return;
    setLearningClassName(() => {
      if (subtitleStyling.learning) return getLearningStateClass(basicForm);
      return '';
    })
  }, [basicForm, getLearningStateClass, subtitleStyling]);

  const handleChange = useCallback((pressedString) => {
    navigator.clipboard.writeText(pressedString);
    setMeaning(pressedString)
  }, [setMeaning]);

  const handleClick = useCallback((e) => {
    handleChange(e.shiftKey ? origin : basicForm);
  }, [handleChange, origin, basicForm]);

  const handleRightClick = useCallback(() => {
    changeLearningState(basicForm);
  }, [changeLearningState, basicForm]);

  useEffect(() => {
    setSeparationContent(() => {
      return separation.map((val, index) => {
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
          <ruby className={learningClassName}
                style={{rubyPosition: "over"}}>
            {/* @ts-expect-error rb wtf eslint*/}
            <rb>{val.main}</rb>
            <rt className={"unselectable"}>{subtitleStyling.showFurigana && showFurigana && hiragana}</rt>
          </ruby>
          <rt className={"unselectable"}>{subtitleStyling.showRomaji && showRomaji && romaji}</rt>
        </ruby>
      })
    })
  }, [separation, subtitleStyling, learningClassName, origin]);

  
  return <StyledSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={handleClick}
      onContextMenu={handleRightClick}>
    <ruby style={{
      rubyPosition: subtitleStyling.positionMeaningTop ? "over" : "under",
      WebkitTextFillColor: wordMeaning ? subtitleStyling.textMeaning.color : '',
      WebkitTextStrokeColor: subtitleStyling.stroke.color,
      WebkitTextStrokeWidth: subtitleStyling.stroke.width,
    }}>
      {/* @ts-expect-error rb wtf eslint*/}
      <rb>{separationContent}</rb>
      <rt style={{fontWeight: subtitleStyling.textMeaning.weight}}
          className={"internalMeaning unselectable"}>{
          subtitleStyling.showMeaning
          && wordMeaning.length <= subtitleStyling.maximalMeaningLengthPerCharacter * origin.length
          && wordMeaning}</rt>

    </ruby>
  </StyledSentence>
}

export const PlainSentence = ({origin}) => {
  return <div key={uuidv4()}>{parse(origin)}</div>
}

export const KanjiSentence = ({
                                setMeaning,
                                separation,
                                extraClass,
                                subtitleStyling,
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
          {Array.from(val.main).map((char, idx) => {
            return <StyledSentence
                key={idx}
                subtitleStyling={subtitleStyling}
                className={extraClass}
                onClick={() => {
                  handleChange(char)
                }}><>{char as ReactNode}</>
            </StyledSentence>
          })}
          <rt className={"unselectable"}>{hiragana}</rt>
        </ruby>
      </ruby>
    })}
  </>
}


export const HanziSentence = ({
                                origin,
                                setMeaning,
                                extraClass,
                                subtitleStyling,
                                pinyin
                              }: SentenceParam) => {
  const handleChange = useCallback((newWord) => {
    navigator.clipboard.writeText(newWord);
    setMeaning(newWord)
  }, [setMeaning]);
  return <>
    {Array.from(origin).map((val, index) => {
      return <ruby style={{
        rubyPosition: "under",
        WebkitTextFillColor: subtitleStyling.text.color,
      }} key={index}>
        <ruby style={{rubyPosition: "over"}}>
          <StyledChineseSentence
              subtitleStyling={subtitleStyling}
              className={extraClass}
              onClick={() => {
                handleChange(val)
              }}>

            {/* @ts-expect-error rb wtf eslint*/}
            <rb>{val}</rb>
          </StyledChineseSentence>
          <rt className={"unselectable"}>{index < (pinyin ?? '').length ? pinyin[index] : ''}</rt>
        </ruby>
      </ruby>
    })}
  </>
}


export const ChineseSentence = ({
                                  origin,
                                  setMeaning,
                                  separation,
                                  extraClass,
                                  subtitleStyling,
                                  wordMeaning = '',
                                  changeLearningState = () => '',
                                  getLearningStateClass = () => ''
                                }: SentenceParam) => {
  const handleChange = useCallback((pressedString) => {
    navigator.clipboard.writeText(pressedString);
    setMeaning(pressedString)
  }, [setMeaning]);
  const [learningClassName, setLearningClassName] = useState('');
  const [separationContent, setSeparationContent] = useState([]);
  useEffect(() => {
    if (!getLearningStateClass) return;
    setLearningClassName(() => {
      if (subtitleStyling.learning) return getLearningStateClass(origin);
      return '';
    })
  }, [subtitleStyling, origin, getLearningStateClass]);

  const handleClick = useCallback(() => {
    handleChange(origin);
  }, [handleChange, origin]);

  const handleRightClick = useCallback(() => {
    changeLearningState(origin);
  }, [changeLearningState, origin]);

  useEffect(() => {
    // Check if this is Vietnamese (no jyutping/pinyin but has separation)
    const isVietnamese = separation.length > 0 && 
                         !separation.some(s => s.jyutping || s.pinyin) &&
                         separation.some(s => s.meaning !== undefined);
    
    setSeparationContent(() => {
      const elements = [];
      
      separation.forEach((val, index) => {
        // Add the main ruby element
        elements.push(
          <ruby className={learningClassName}
                style={{
                  rubyPosition: "over",
                }} key={`word-${index}`}>
            {/* @ts-expect-error rb wtf eslint*/}
            <rb>{val.main}</rb>
            <rt className={"unselectable"}>{subtitleStyling.showFurigana && learningClassName !== 'state2' && (val.jyutping ?? val.pinyin)}</rt>
          </ruby>
        );
        
        // For Vietnamese, add a space ruby element between components (except after spaces or at the end)
        if (isVietnamese && index < separation.length - 1) {
          elements.push(
            <ruby key={`space-${index}`} style={{ fontSize: '0.8em' }}>
              {/* @ts-expect-error rb wtf eslint*/}
              <rb>{' '}</rb>
            </ruby>
          );
        }
      });
      
      return elements;
    });
  }, [separation, subtitleStyling, learningClassName])

  return <StyledChineseSentence
      subtitleStyling={subtitleStyling}
      className={extraClass}
      onClick={handleClick}
      onContextMenu={handleRightClick}>
    <ruby style={{
      rubyPosition: subtitleStyling.positionMeaningTop ? "over" : "under",
      WebkitTextFillColor: wordMeaning ? subtitleStyling.textMeaning.color : '',
      WebkitTextStrokeColor: subtitleStyling.stroke.color,
      WebkitTextStrokeWidth: subtitleStyling.stroke.width,
    }}>
      {/* @ts-expect-error rb wtf eslint*/}
      <rb>{separationContent}</rb>
      <rt style={{fontWeight: subtitleStyling.textMeaning.weight}}
          className={"internalMeaning unselectable"}>{
          (subtitleStyling.showMeaning || learningClassName === 'state0' || learningClassName === 'state3')
          && wordMeaning.length <= subtitleStyling.maximalMeaningLengthPerCharacter * origin.length
          && wordMeaning}</rt>

    </ruby>
  </StyledChineseSentence>
}
