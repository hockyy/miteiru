import React, {useCallback, useEffect, useState} from "react";
import {ChineseSentence, JapaneseSentence, PlainSentence} from "./Sentence";
import {CJKStyling} from "../../utils/CJKStyling";
import {SubtitleContainer} from "./DataStructures";
import {adjustTimeWithShift} from "../../utils/utils";

interface LyricsLine {
  content: any[] | string;
  meaning: string[];
  startTime: number;
  endTime: number;
  index: number;
}

interface ScrollingLyricsProps {
  currentTime: number;
  subtitle: SubtitleContainer;
  shift: number;
  setMeaning: (newMeaning: string) => void;
  subtitleStyling: CJKStyling;
  changeLearningState?: (newMeaning: string) => void;
  getLearningStateClass?: (newMeaning: string) => string;
  setExternalContent?: (content: any[]) => void;
  setRubyCopyContent: any;
  linesVisible?: number;
  currentLinePosition?: number;
}

const Measurement = {
  lineHeight : 100
}

export const ScrollingLyrics = ({
  currentTime,
  subtitle,
  shift,
  setMeaning,
  subtitleStyling,
  changeLearningState = () => '',
  getLearningStateClass = () => '',
  setExternalContent,
  setRubyCopyContent,
  linesVisible = 3,
  currentLinePosition = 1
}: ScrollingLyricsProps) => {
  const [displayLines, setDisplayLines] = useState<LyricsLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);

  const getLyricsWindow = useCallback((adjustedTime: number) => {
    if (!subtitle.lines || subtitle.lines.length === 0) {
      return { lines: [], currentIndex: -1 };
    }

    const allLines: LyricsLine[] = subtitle.lines.map((line, index) => ({
      content: line.content,
      meaning: line.meaning || [],
      startTime: line.timeStart,
      endTime: line.timeEnd,
      index
    }));

    // Find current line
    const currentIndex = allLines.findIndex(line =>
      line.startTime <= adjustedTime && adjustedTime <= line.endTime
    );

    if (currentIndex === -1) {
      // No current line, find the next upcoming line
      const nextIndex = allLines.findIndex(line => line.startTime > adjustedTime);
      if (nextIndex === -1) {
        // Show the last few lines if we're past everything
        const startIndex = Math.max(0, allLines.length - linesVisible);
        return {
          lines: allLines.slice(startIndex),
          currentIndex: -1
        };
      }

      const startIndex = Math.max(0, nextIndex - currentLinePosition);
      const endIndex = Math.min(allLines.length, startIndex + linesVisible);

      return {
        lines: allLines.slice(startIndex, endIndex),
        currentIndex: -1
      };
    }

    // Calculate window around current line
    const startIndex = Math.max(0, currentIndex - currentLinePosition);
    const endIndex = Math.min(allLines.length, startIndex + linesVisible);

    return {
      lines: allLines.slice(startIndex, endIndex),
      currentIndex: currentIndex - startIndex
    };
  }, [subtitle.lines, linesVisible, currentLinePosition]);

  useEffect(() => {
    const adjustedTime = adjustTimeWithShift(currentTime, shift);
    const { lines, currentIndex } = getLyricsWindow(adjustedTime);
    setDisplayLines(lines);
    setCurrentLineIndex(currentIndex);

    // Set external content for the current line
    if (currentIndex >= 0 && currentIndex < lines.length) {
      const currentLine = lines[currentIndex];
      if (setExternalContent) {
        setExternalContent(Array.isArray(currentLine.content) ? currentLine.content : []);
      }
    }
  }, [currentTime, shift, getLyricsWindow, setExternalContent]);

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
      <div
        className="lyrics-container"
        style={{
          width: '85vw',
          maxWidth: '85vw',
          height: `${linesVisible * Measurement.lineHeight + 200}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-around',
          backgroundColor: subtitleStyling.background,
          borderRadius: '16px',
          padding: '24px',
          fontFamily: subtitleStyling.text.fontFamily,
          fontWeight: subtitleStyling.text.weight,
          fontSize: subtitleStyling.text.fontSize,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {displayLines.map((line, index) => (
          <LyricsLine
            key={`${line.index}-${index}`}
            line={line}
            isCurrent={index === currentLineIndex}
            isPast={index < currentLineIndex}
            isFuture={index > currentLineIndex}
            setMeaning={setMeaning}
            subtitleStyling={subtitleStyling}
            changeLearningState={changeLearningState}
            getLearningStateClass={getLearningStateClass}
            setRubyCopyContent={setRubyCopyContent}
          />
        ))}
      </div>
    </div>
  );
};

const LyricsLine = ({
  line,
  isCurrent,
  isPast,
  isFuture,
  setMeaning,
  subtitleStyling,
  changeLearningState,
  getLearningStateClass,
  setRubyCopyContent
}: {
  line: LyricsLine;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  setMeaning: (newMeaning: string) => void;
  subtitleStyling: CJKStyling;
  changeLearningState?: (newMeaning: string) => void;
  getLearningStateClass?: (newMeaning: string) => string;
  setRubyCopyContent: any;
}) => {
  const getLineOpacity = () => {
    if (isCurrent) return 1.0;
    if (isPast) return 0.5;
    if (isFuture) return 0.7;
    return 0.3;
  };

  const getLineScale = () => {
    if (isCurrent) return 1.05;
    return 1.0;
  };

  const lineStyle: React.CSSProperties = {
    opacity: getLineOpacity(),
    transform: `scale(${getLineScale()})`,
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    textAlign: 'center',
    padding: '12px 8px',
    pointerEvents: isCurrent ? 'auto' : 'none',
    borderRadius: '8px',
    backgroundColor: isCurrent ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
    minHeight: `${Measurement.lineHeight}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Handle current line ruby copy content
  useEffect(() => {
    if (isCurrent && line.content && Array.isArray(line.content)) {
      let rubyCopyContent = '';
      line.content.forEach((val, index) => {
        const rubyHtml = val.separation?.map(part => {
          const isChineseSentence = val.jyutping || val.pinyin;
          const isJapaneseSentence = val.hiragana !== undefined;
          const isVietnameseSentence = val.separation && !val.jyutping && !val.pinyin && !val.hiragana;

          let reading;
          if (isChineseSentence) {
            reading = part.jyutping || part.pinyin;
          } else if (isJapaneseSentence) {
            reading = part.hiragana || part.romaji;
          } else if (isVietnameseSentence) {
            reading = part.meaning || '';
          } else {
            reading = '';
          }
          return `<ruby>${part.main}<rt>${reading || ''}</rt></ruby>`;
        }).join('') || val.origin;

        rubyCopyContent += rubyHtml;
        if (index + 1 < line.content.length && subtitleStyling.showSpace) {
          rubyCopyContent += ' ';
        }
      });
      setRubyCopyContent(rubyCopyContent);
    }
  }, [isCurrent, line.content, subtitleStyling.showSpace, setRubyCopyContent]);

  // Empty line placeholder
  if (!line.content || (typeof line.content === 'string' && line.content === '')) {
    return <div style={lineStyle}>🎶🎶🎵</div>;
  }

  // Handle string content
  if (typeof line.content === 'string') {
    return (
      <div style={lineStyle}>
        <PlainSentence origin={line.content} />
      </div>
    );
  }

  // Handle separated content
  return (
    <div style={lineStyle}>
      {line.content.map((val, index) => {
        const validBasicForm = val.basicForm != '' && val.basicForm != '*';
        const isChineseSentence = val.jyutping || val.pinyin;
        const isVietnameseSentence = val.separation && !val.jyutping && !val.pinyin && !val.hiragana;

        const SentenceComponent = isChineseSentence || isVietnameseSentence ? ChineseSentence : JapaneseSentence;

        return (
          <React.Fragment key={index}>
            <SentenceComponent
              origin={val.origin}
              separation={val.separation}
              setMeaning={setMeaning}
              extraClass="lyrics-word"
              subtitleStyling={subtitleStyling}
              basicForm={validBasicForm ? val.basicForm : ''}
              wordMeaning={line.meaning[index] || ''}
              getLearningStateClass={getLearningStateClass}
              changeLearningState={changeLearningState}
            />
            {index + 1 < line.content.length && subtitleStyling.showSpace ? " " : " "}
          </React.Fragment>
        );
      })}
    </div>
  );
};
