import React from 'react';
import { Button } from '../../../Utils/Button';
import { FaChevronLeft, FaChevronRight, FaStop, FaVolumeUp } from 'react-icons/fa';
import { MEANING_HEADER, MEANING_READING_BUBBLE } from '../../meaningBoxTheme';
import { RomajiedContent } from './RomajiedContent';
import { getLearningLevelColor } from '../../../VideoPlayer/vocabLevels';
import { SAVE_LEVELS, isAutoKnown, savedLevelOf } from '../../../../utils/vocabSaveLevels';
import type { defaultMeaningBoxStyling } from '../../../../utils/CJKStyling';
import { DEFAULT_SUBTITLE_FONT } from '../../../../utils/fonts';
import type { RomajiedGroup } from '../types';

type MeaningBoxHeaderProps = {
  meaning: string;
  hskLabel?: string;
  meaningIndex: number;
  otherMeaningsCount: number;
  romajiedData: RomajiedGroup[];
  lang: string;
  setMeaning: (value: string) => void;
  subtitleStyling: typeof defaultMeaningBoxStyling;
  speaking: boolean;
  speechSupported: boolean;
  onSpeak: () => void;
  onPrevious: () => void;
  onNext: () => void;
  getLearningState?: ((term: string) => number) | null;
  setLearningLevel?: ((term: string, level: number) => void) | null;
  /** Back to the previous word; the button shows only when there is one. */
  onBack?: (() => void) | null;
  /** Closes the popup; the button shows only when given. */
  onClose?: (() => void) | null;
};

/** Sticky top bar: prev/next senses, TTS, headword ruby, learning star. */
export const MeaningBoxHeader = ({
  meaning,
  hskLabel,
  meaningIndex,
  otherMeaningsCount,
  romajiedData,
  lang,
  setMeaning,
  subtitleStyling,
  speaking,
  speechSupported,
  onSpeak,
  onPrevious,
  onNext,
  getLearningState,
  setLearningLevel,
  onBack = null,
  onClose = null,
}: MeaningBoxHeaderProps) => (
  <div className={MEANING_HEADER}>
    {(onBack || onClose) && <div className="flex w-full items-center justify-between gap-3">
      {onBack
        ? <Button type="secondary" size="small" onPress={onBack} title="Back to the previous word (Backspace)">
          ← Back
        </Button>
        : <span />}
      {onClose && <Button type="secondary" size="small" onPress={onClose} title="Close (Esc)">
        <span aria-hidden="true">✕</span> Close (Esc)
      </Button>}
    </div>}

    {/* Other dictionary entries for the same text (homographs); hidden when there is just one. */}
    {otherMeaningsCount > 1 && <div className="flex w-full items-center justify-between gap-3">
      <Button
        type="secondary"
        size="small"
        disabled={meaningIndex === 0}
        onPress={onPrevious}
        className="inline-flex items-center gap-1.5"
        title="Previous dictionary entry"
      >
        <FaChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-900">
        Entry {meaningIndex + 1}
        <span className="font-medium text-blue-500"> of {otherMeaningsCount}</span>
      </div>

      <Button
        type="secondary"
        size="small"
        disabled={meaningIndex >= otherMeaningsCount - 1}
        onPress={onNext}
        className="inline-flex items-center gap-1.5"
        title="Next dictionary entry"
      >
        <span className="hidden sm:inline">Next</span>
        <FaChevronRight aria-hidden="true" />
      </Button>
    </div>}

    <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onSpeak}
        disabled={!speechSupported}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-yellow-300 bg-yellow-100 text-base text-blue-900 shadow-[0_2px_0_0_#fde68a] transition-all hover:-translate-y-0.5 hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={speaking ? 'Stop speaking' : 'Pronounce this word'}
        title={speaking ? 'Stop speaking' : 'Pronounce this word'}
      >
        {speaking ? <FaStop aria-hidden="true" /> : <FaVolumeUp aria-hidden="true" />}
      </button>

      <div
        className="flex min-w-0 flex-wrap items-center justify-center gap-3"
        style={{ fontFamily: DEFAULT_SUBTITLE_FONT, fontSize: 'clamp(30px, 4vw, 40px)' }}
      >
        {romajiedData.map(({ key, romajied }) => (
          <RomajiedContent
            key={key}
            romajied={romajied}
            lang={lang}
            setMeaning={setMeaning}
            subtitleStyling={subtitleStyling}
          />
        ))}
      </div>
    </div>

    {hskLabel && <span className={MEANING_READING_BUBBLE} title="HSK 3.0 word level">{hskLabel}</span>}

    {getLearningState && setLearningLevel && (() => {
      const level = getLearningState(meaning);
      const current = savedLevelOf(level);
      return (
        <div className="flex w-full flex-col items-center gap-1">
          <div role="group" aria-label="How well do you know this word?" className="inline-flex overflow-hidden rounded-full border border-blue-300 bg-white shadow-[0_2px_0_0_#bfdbfe]">
            {SAVE_LEVELS.map(({ level: option, label }) => {
              const pressed = current === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setLearningLevel(meaning, option)}
                  title={`Save as ${label}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-blue-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${pressed ? 'ring-1 ring-inset ring-blue-400' : 'hover:bg-yellow-50'}`}
                  style={pressed ? { backgroundColor: getLearningLevelColor(option) } : undefined}
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-blue-900/40" style={{ backgroundColor: getLearningLevelColor(option) }} />
                  {label}
                </button>
              );
            })}
          </div>
          {isAutoKnown(level) && (
            <span className="text-[11px] font-medium text-blue-700">common in this video</span>
          )}
        </div>
      );
    })()}
  </div>
);
