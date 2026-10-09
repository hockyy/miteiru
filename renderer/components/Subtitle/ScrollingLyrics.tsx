import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {ChineseSentence, JapaneseSentence, PlainSentence} from "./Sentence";
import {CJKStyling} from "../../utils/CJKStyling";
import {getLyricsWindow, Line, NO_MEANING, SubtitleContainer} from "./DataStructures";
import {buildRubyCopyHtml, getSubtitleTokenPresentation, wordSeparator} from "./subtitleLanguageSupport";
import {adjustTimeWithShift} from "../../utils/utils";
import type {PlaybackClock} from "../../utils/playbackClock";

interface LyricsLine {
  content: any[] | string;
  meaning: string[];
  startTime: number;
  endTime: number;
  index: number;
}

interface ScrollingLyricsProps {
  clock: PlaybackClock;
  subtitle: SubtitleContainer;
  shift: number;
  setMeaning: (newMeaning: string) => void;
  subtitleStyling: CJKStyling;
  changeLearningState?: (newMeaning: string) => void;
  getLearningStateClass?: (newMeaning: string) => string;
  setExternalContent?: (content: any[]) => void;
  setRubyCopyContent: any;
  // The current line's [start, end] (shifted ms), [] between lines; back-to-head and auto-pause use it.
  timeCache?: number[];
  setTimeCache?: (cache: number[]) => void;
  linesVisible?: number;
  currentLinePosition?: number;
}

// The lyrics block is scaled down to fit in this fraction of the window height.
const WINDOW_FIT = 0.92;

// The scale (never above 1, never below minScale) that makes content of that height fit the available height.
export const fitScale = (contentHeight: number, availableHeight: number, minScale = 0.5) => {
  if (contentHeight <= 0 || contentHeight <= availableHeight) return 1;
  return Math.max(minScale, availableHeight / contentHeight);
};

interface LyricsWindow {
  // Index (in the subtitle) of the first visible line.
  start: number;
  // Position of the current line among the visible ones, or -1 between lines.
  current: number;
  lines: LyricsLine[];
}

const EMPTY_WINDOW: LyricsWindow = {start: 0, current: -1, lines: []};

const sameLines = (shown: LyricsLine[], visible: Line[]) => shown.length === visible.length
  && shown.every((line, index) => line.content === visible[index].content && line.meaning === (visible[index].meaning ?? NO_MEANING));

export const ScrollingLyrics = ({
  clock,
  subtitle,
  shift,
  setMeaning,
  subtitleStyling,
  changeLearningState = () => '',
  getLearningStateClass = () => '',
  setExternalContent,
  setRubyCopyContent,
  timeCache,
  setTimeCache,
  linesVisible = 3,
  currentLinePosition = 1
}: ScrollingLyricsProps) => {
  const [{lines: displayLines, current: currentLineIndex}, setLyricsWindow] = useState<LyricsWindow>(EMPTY_WINDOW);
  const shownRef = useRef(EMPTY_WINDOW);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  // Runs on every clock tick; re-renders only when the window moves or a visible line gets tokens or glosses.
  useEffect(() => {
    let reportedCache = timeCache;
    const update = () => {
      const {start, current} = getLyricsWindow(subtitle.lines, adjustTimeWithShift(clock.get(), shift), linesVisible, currentLinePosition);
      const visible = (subtitle.lines ?? []).slice(start, start + linesVisible);
      const currentLine = current >= 0 ? visible[current] : null;
      const nextCache = currentLine ? [currentLine.timeStart, currentLine.timeEnd] : [];
      if (setTimeCache && !(reportedCache?.length === nextCache.length && reportedCache.every((time, index) => time === nextCache[index]))) {
        reportedCache = nextCache;
        setTimeCache(nextCache);
      }
      const shown = shownRef.current;
      if (shown.start === start && shown.current === current && sameLines(shown.lines, visible)) return;

      const next: LyricsWindow = {
        start,
        current,
        lines: visible.map((line, index) => ({
          content: line.content,
          meaning: line.meaning ?? NO_MEANING,
          startTime: line.timeStart,
          endTime: line.timeEnd,
          index: start + index
        }))
      };
      shownRef.current = next;
      setLyricsWindow(next);
      if (current >= 0 && setExternalContent) {
        const content = next.lines[current].content;
        setExternalContent(Array.isArray(content) ? content : []);
      }
    };
    update();
    const unsubscribeClock = clock.subscribe(update);
    const unsubscribeAnalysis = subtitle.onChange?.(update);
    return () => {
      unsubscribeClock();
      unsubscribeAnalysis?.();
    };
  }, [clock, shift, subtitle, linesVisible, currentLinePosition, setExternalContent, timeCache, setTimeCache]);

  // The block is as tall as its lines (a fixed height used to squeeze them, so readings and meanings ran
  // into the neighbouring lines). When it is taller than the window, scale it down to fit; a transform
  // leaves the layout size alone, so this can't feed back into the observer.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const refit = () => {
      const next = fitScale(container.offsetHeight, window.innerHeight * WINDOW_FIT);
      setFit((current) => Math.abs(current - next) < 0.005 ? current : next);
    };
    refit();
    const observer = new ResizeObserver(refit);
    observer.observe(container);
    window.addEventListener('resize', refit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refit);
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
      <div
        ref={containerRef}
        className="lyrics-container"
        style={{
          width: '85vw',
          maxWidth: '85vw',
          display: displayLines.length > 0 ? 'flex' : 'none',
          flexDirection: 'column',
          justifyContent: 'center',
          // Room for the current line to grow by its scale without touching the next one.
          rowGap: '0.15em',
          transform: fit < 1 ? `scale(${fit})` : undefined,
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
            // Keyed by subtitle line, so a line keeps its element (and transition) as the window scrolls.
            key={line.index}
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
    transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    textAlign: 'center',
    padding: '12px 8px',
    pointerEvents: isCurrent ? 'auto' : 'none',
    borderRadius: '8px',
    backgroundColor: isCurrent ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
    // A line is never squeezed below its content: readings over the words, meanings under them.
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Handle current line ruby copy content
  useEffect(() => {
    if (isCurrent && line.content && Array.isArray(line.content)) {
      setRubyCopyContent(buildRubyCopyHtml(line.content, Boolean(subtitleStyling.showSpace)));
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
        // Japanese tokens with an empty reading (Latin words, unknown words) stay Japanese.
        const SentenceComponent = getSubtitleTokenPresentation(val).sentenceKind === "chinese" ? ChineseSentence : JapaneseSentence;

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
            {wordSeparator(val, Boolean(subtitleStyling.showSpace))}
          </React.Fragment>
        );
      })}
    </div>
  );
};
