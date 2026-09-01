import parse from "html-react-parser";
import styled from "styled-components";
import { CJKStyling, defaultLearningColorStyling } from "../../utils/CJKStyling";
import { getTextShadowFromStroke } from "../../utils/subtitleStroke";
import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { isMixed, toRomaji } from "wanakana"
import { v4 as uuidv4 } from 'uuid';

const writeClipboardText = (value: string) => {
  navigator.clipboard.writeText(value).catch((error) => {
    console.warn('Failed to copy sentence text:', error);
  });
};

const strokeShadow = (width: string, color: string) => getTextShadowFromStroke(width, color);

const disableWebkitStroke = `
  -webkit-text-stroke-width: 0;
  -webkit-text-stroke-color: transparent;
`;

const rubyOverReadingClass = (...extra: string[]) =>
  ["ruby-over-reading", ...extra].filter(Boolean).join(" ");

const meaningRubyClass = (positionMeaningTop?: boolean) =>
  positionMeaningTop ? "ruby-over-reading" : "ruby-under-reading";

const StyledSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  ${disableWebkitStroke}
  text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.color)};

  ruby, rt {
    ${disableWebkitStroke}
  }

  ruby {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.color};
    ruby-align: center;
  }

  rt {
    text-align: center;
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
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
  }

  &:hover rt.internalMeaning {
    -webkit-text-fill-color: ${props => props.subtitleStyling.textMeaning?.hoverColor ?? props.subtitleStyling.text.hoverColor};
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
  }
`

const StyledChineseSentence = styled.button<{ subtitleStyling: CJKStyling }>`
  ${disableWebkitStroke}
  text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.color)};

  ruby, rt {
    ${disableWebkitStroke}
  }

  ruby {
    -webkit-text-fill-color: ${props => props.subtitleStyling.text.color};
    ruby-align: center;
  }

  rt {
    text-align: center;
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
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
  }

  &:hover .state0 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].hoverColor};
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
  }

  &:hover .state1 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].hoverColor};
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
  }

  &:hover .state2 {
    -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].hoverColor};
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
  }

  &:hover rt.internalMeaning {
    -webkit-text-fill-color: ${props => props.subtitleStyling.textMeaning?.hoverColor ?? props.subtitleStyling.text.hoverColor};
    text-shadow: ${props => strokeShadow(props.subtitleStyling.stroke.width, props.subtitleStyling.stroke.hoverColor)};
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
  pinyin?: string[],
  reading?: string[]
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
    writeClipboardText(pressedString);
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
        // Plain text only: these render inside an <rt>, and nested <rt>/<rp> is invalid HTML.
        const hiragana = val.hiragana ?? '';
        const romaji = val.romaji != '' ? val.romaji : toRomaji(val.main);
        const showHelp = val.isKanji || val.isMixed || isMixed(origin);
        const showRomaji = (val.isKana || showHelp);
        const showFurigana = ((val.isKana && subtitleStyling.showFuriganaOnKana) || showHelp);
        return <ruby className="ruby-under-reading" style={{
          rubyPosition: "under",
        }} key={index}>
          <ruby className={rubyOverReadingClass(learningClassName)}
            style={{ rubyPosition: "over" }}>
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
    <ruby className={meaningRubyClass(subtitleStyling.positionMeaningTop)} style={{
      rubyPosition: subtitleStyling.positionMeaningTop ? "over" : "under",
      WebkitTextFillColor: wordMeaning ? subtitleStyling.textMeaning.color : '',
    }}>
      {/* @ts-expect-error rb wtf eslint*/}
      <rb>{separationContent}</rb>
      <rt style={{ fontWeight: subtitleStyling.textMeaning.weight }}
        className={"internalMeaning unselectable"}>{
          subtitleStyling.showMeaning
          && wordMeaning.length <= subtitleStyling.maximalMeaningLengthPerCharacter * origin.length
          && wordMeaning}</rt>

    </ruby>
  </StyledSentence>
}

export const PlainSentence = ({ origin }) => {
  return <div key={uuidv4()}>{parse(origin)}</div>
}

export const KanjiSentence = ({
  setMeaning,
  separation,
  extraClass,
  subtitleStyling,
}: SentenceParam) => {
  const handleChange = useCallback((newWord) => {
    writeClipboardText(newWord);
    setMeaning(newWord)
  }, [setMeaning]);
  return <>
    {separation.map((val, index) => {
      return <ruby className="ruby-over-reading" style={{
        rubyPosition: "over",
        WebkitTextFillColor: subtitleStyling.text.color,
      }} key={index}>
        {/* @ts-expect-error rb wtf eslint*/}
        <rb>
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
        </rb>
        <rt className={"unselectable"}>{val.hiragana ?? ''}</rt>
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
    writeClipboardText(newWord);
    setMeaning(newWord)
  }, [setMeaning]);
  return <>
    {Array.from(origin).map((val, index) => {
      return <StyledChineseSentence
        key={index}
        subtitleStyling={subtitleStyling}
        className={extraClass}
        onClick={() => {
          handleChange(val)
        }}>
        <ruby className="ruby-over-reading" style={{ rubyPosition: "over" }}>
          {/* @ts-expect-error rb wtf eslint*/}
          <rb>{val}</rb>
          <rt className={"unselectable"}>{index < (pinyin ?? '').length ? pinyin[index] : ''}</rt>
        </ruby>
      </StyledChineseSentence>
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
    writeClipboardText(pressedString);
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
      !separation.some(s => s.jyutping || s.pinyin);
    setSeparationContent(() => {
      const elements = [];

      separation.forEach((val, index) => {
        // Add the main ruby element
        elements.push(
          <ruby className={rubyOverReadingClass(learningClassName)}
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
    <ruby className={meaningRubyClass(subtitleStyling.positionMeaningTop)} style={{
      rubyPosition: subtitleStyling.positionMeaningTop ? "over" : "under",
      WebkitTextFillColor: wordMeaning ? subtitleStyling.textMeaning.color : '',
    }}>
      {/* @ts-expect-error rb wtf eslint*/}
      <rb>{separationContent}</rb>
      <rt style={{ fontWeight: subtitleStyling.textMeaning.weight }}
        className={"internalMeaning unselectable"}>{
          (subtitleStyling.showMeaning || learningClassName === 'state0' || learningClassName === 'state3')
          && wordMeaning.length <= subtitleStyling.maximalMeaningLengthPerCharacter * origin.length
          && wordMeaning}</rt>

    </ruby>
  </StyledChineseSentence>
}


export const TokenLikeSentence = ({
  setMeaning,
  extraClass,
  subtitleStyling,
  reading,
  separation
}: SentenceParam) => {
  const handleChange = useCallback((newWord) => {
    writeClipboardText(newWord);
    setMeaning(newWord)
  }, [setMeaning]);
  // Todo: Add space between the ruby between the maps only if index not the last
  return <>
    {separation.map((val, index) => {
      return <StyledChineseSentence
        key={index}
        subtitleStyling={subtitleStyling}
        className={extraClass}
        style={{ marginRight: index === separation.length - 1 ? 0 : '0.3em' }}
        onClick={() => {
          handleChange(val.main)
        }}>
        <ruby className="ruby-over-reading" style={{ rubyPosition: "over" }}>
          {/* @ts-expect-error rb wtf eslint*/}
          <rb>{val.main}</rb>
          <rt className={"unselectable"}>{index < (reading ?? '').length ? reading[index] : ''}</rt>
        </ruby>
      </StyledChineseSentence>
    })}
  </>
}