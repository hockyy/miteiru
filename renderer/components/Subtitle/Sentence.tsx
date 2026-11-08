import {renderSubtitleHtml} from "../../utils/subtitleHtml";
import styled from "styled-components";
import { CJKStyling, defaultLearningColorStyling } from "../../utils/CJKStyling";
import { getTextShadowFromStroke } from "../../utils/subtitleStroke";
import React, { ReactNode, useCallback } from "react";
import { isMixed, toRomaji } from "wanakana"

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

// Annotation rows are fixed by the subtitle's settings, not by an individual word's contents.
// An empty reading or gloss therefore cannot move that word's base text to another baseline.
const StyledAlignedWord = styled.button<{ $subtitleStyling: CJKStyling }>`
  ${disableWebkitStroke}
  -webkit-text-fill-color: ${props => props.$subtitleStyling.text.color};
  text-shadow: ${props => strokeShadow(props.$subtitleStyling.stroke.width, props.$subtitleStyling.stroke.color)};

  &.state0 .subtitle-word__part { -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[0].color}; }
  &.state1 .subtitle-word__part { -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[1].color}; }
  &.state2 .subtitle-word__part { -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[2].color}; }
  &.state3 .subtitle-word__part { -webkit-text-fill-color: ${() => defaultLearningColorStyling.learningColor[3].color}; }

  .subtitle-word__meaning {
    -webkit-text-fill-color: ${props => props.$subtitleStyling.textMeaning?.color ?? props.$subtitleStyling.text.color};
    font-weight: ${props => props.$subtitleStyling.textMeaning?.weight ?? 400};
  }

  &:hover .subtitle-word__part {
    -webkit-text-fill-color: ${props => props.$subtitleStyling.text.hoverColor};
    text-shadow: ${props => strokeShadow(props.$subtitleStyling.stroke.width, props.$subtitleStyling.stroke.hoverColor)};
  }
  &:hover .subtitle-word__meaning {
    -webkit-text-fill-color: ${props => props.$subtitleStyling.textMeaning?.hoverColor ?? props.$subtitleStyling.text.hoverColor};
    text-shadow: ${props => strokeShadow(props.$subtitleStyling.stroke.width, props.$subtitleStyling.stroke.hoverColor)};
  }
`;

export const alignedWordRows = (styling: CJKStyling, japanese: boolean, withReading = true) => {
  const meaning = styling.showMeaning || (!japanese && styling.learning) ? '0.625em' : '0px';
  return {
    '--subtitle-reading-height': styling.showFurigana && withReading ? '0.625em' : '0px',
    '--subtitle-romaji-height': japanese && styling.showRomaji ? '0.625em' : '0px',
    '--subtitle-meaning-top-height': styling.positionMeaningTop ? meaning : '0px',
    '--subtitle-meaning-bottom-height': styling.positionMeaningTop ? '0px' : meaning
  } as React.CSSProperties;
};

type WordPart = {main: string; reading: string; romaji?: string};
const AlignedWordContent = ({parts, meaning}: {parts: WordPart[]; meaning: string}) => <>
  <span className="subtitle-word__parts">
    {parts.map((part, index) => <span className="subtitle-word__part" key={index}>
      <span className="subtitle-word__reading unselectable">{part.reading}</span>
      <span className="subtitle-word__base">{part.main}</span>
      <span className="subtitle-word__romaji unselectable">{part.romaji ?? ''}</span>
    </span>)}
  </span>
  <span className="subtitle-word__meaning internalMeaning unselectable">{meaning}</span>
</>;

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
  const learningClassName = subtitleStyling.learning ? getLearningStateClass?.(basicForm || origin) ?? '' : '';

  const handleChange = useCallback((pressedString) => {
    if (!pressedString) return;
    writeClipboardText(pressedString);
    setMeaning(pressedString)
  }, [setMeaning]);

  const handleClick = useCallback((e) => {
    handleChange(e.shiftKey ? origin : (basicForm || origin));
  }, [handleChange, origin, basicForm]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    // Right-click saves the word; the webview's own menu would open on top of that.
    e.preventDefault();
    // Unknown words have no basic form; fall back to the surface form like left-click.
    changeLearningState(basicForm || origin);
  }, [changeLearningState, basicForm, origin]);

  const parts: WordPart[] = (separation?.length ? separation : [{main: origin}]).map((part) => {
    const showHelp = part.isKanji || part.isMixed || isMixed(origin);
    return {
      main: part.main,
      reading: subtitleStyling.showFurigana && ((part.isKana && subtitleStyling.showFuriganaOnKana) || showHelp) ? part.hiragana ?? '' : '',
      romaji: subtitleStyling.showRomaji && (part.isKana || showHelp) ? part.romaji || toRomaji(part.hiragana || part.main) : ''
    };
  });
  const meaning = subtitleStyling.showMeaning && wordMeaning.length <= (subtitleStyling.maximalMeaningLengthPerCharacter ?? Infinity) * origin.length
    ? wordMeaning : '';

  return <StyledAlignedWord
    type="button"
    $subtitleStyling={subtitleStyling}
    className={`subtitle-word ${learningClassName} ${extraClass}`}
    data-meaning-position={subtitleStyling.positionMeaningTop ? 'top' : 'bottom'}
    style={alignedWordRows(subtitleStyling, true)}
    onClick={handleClick}
    onContextMenu={handleRightClick}>
    <AlignedWordContent parts={parts} meaning={meaning}/>
  </StyledAlignedWord>
}

export const PlainSentence = ({ origin }) => {
  return <div>{renderSubtitleHtml(origin)}</div>
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
      // A reading that repeats the kana under it (べる over べる, ちょっと over ちょっと) says nothing.
      const reading = val.hiragana && val.hiragana !== val.main ? val.hiragana : '';
      return <ruby className="ruby-over-reading" style={{
        rubyPosition: "over",
        WebkitTextFillColor: subtitleStyling.text.color,
      }} key={index}>
        <span className="ruby-reading-base">
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
        </span>
        <rt className={"unselectable"}>{subtitleStyling.showFurigana ? reading : ''}</rt>
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
  const learningClassName = subtitleStyling.learning ? getLearningStateClass?.(origin) ?? '' : '';

  const handleClick = useCallback(() => {
    handleChange(origin);
  }, [handleChange, origin]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    // Right-click saves the word; the webview's own menu would open on top of that.
    e.preventDefault();
    changeLearningState(origin);
  }, [changeLearningState, origin]);

  const sourceParts = separation?.length ? separation : [{main: origin}];
  // Reading keys are retained even for unknown Chinese words, so an empty pinyin still reserves its row.
  const hasReading = sourceParts.some((part) => 'jyutping' in part || 'pinyin' in part);
  const parts: WordPart[] = sourceParts.map((part) => ({main: part.main,
    reading: subtitleStyling.showFurigana && learningClassName !== 'state2' ? part.jyutping ?? part.pinyin ?? '' : ''}));
  const meaning = (subtitleStyling.showMeaning || learningClassName === 'state0' || learningClassName === 'state3')
    && wordMeaning.length <= (subtitleStyling.maximalMeaningLengthPerCharacter ?? Infinity) * origin.length ? wordMeaning : '';

  return <StyledAlignedWord
    type="button"
    $subtitleStyling={subtitleStyling}
    className={`subtitle-word ${learningClassName} ${extraClass}`}
    data-meaning-position={subtitleStyling.positionMeaningTop ? 'top' : 'bottom'}
    style={{...alignedWordRows(subtitleStyling, false, hasReading), '--subtitle-part-gap': hasReading ? '0px' : '0.16em'} as React.CSSProperties}
    onClick={handleClick}
    onContextMenu={handleRightClick}>
    <AlignedWordContent parts={parts} meaning={meaning}/>
  </StyledAlignedWord>
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
