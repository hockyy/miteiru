import React from 'react';
import { Button } from '../../../Utils/Button';
import { FaChevronLeft, FaChevronRight, FaStop, FaVolumeUp } from 'react-icons/fa';
import { MEANING_HEADER } from '../../meaningBoxTheme';
import { OutlinedStar } from './shared/OutlinedStar';
import { RomajiedContent } from './RomajiedContent';
import { getStarColor } from '../constants';
import type { defaultMeaningBoxStyling } from '../../../../utils/CJKStyling';
import type { RomajiedGroup } from '../types';

type MeaningBoxHeaderProps = {
  meaning: string;
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
  changeLearningState?: ((term: string) => void) | null;
};

/** Sticky top bar: prev/next senses, TTS, headword ruby, learning star. */
export const MeaningBoxHeader = ({
  meaning,
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
  changeLearningState,
}: MeaningBoxHeaderProps) => (
  <div className={MEANING_HEADER}>
    <div className="flex w-full items-center justify-between gap-3">
      <Button
        type="secondary"
        size="small"
        disabled={meaningIndex === 0}
        onPress={onPrevious}
        className="inline-flex items-center gap-1.5"
      >
        <FaChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <div className="rounded-full border border-blue-600 bg-white px-3 py-1 text-xs font-bold text-blue-900 shadow-sm">
        Sense {meaningIndex + 1}
        <span className="font-medium text-blue-500"> / {otherMeaningsCount}</span>
      </div>

      <Button
        type="secondary"
        size="small"
        disabled={meaningIndex >= otherMeaningsCount - 1}
        onPress={onNext}
        className="inline-flex items-center gap-1.5"
      >
        <span className="hidden sm:inline">Next</span>
        <FaChevronRight aria-hidden="true" />
      </Button>
    </div>

    <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onSpeak}
        disabled={!speechSupported}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-blue-700 bg-yellow-200 text-base text-blue-900 shadow-[0_2px_0_0_#1d4ed8] transition-all hover:-translate-y-0.5 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={speaking ? 'Stop speaking' : 'Pronounce this word'}
        title={speaking ? 'Stop speaking' : 'Pronounce this word'}
      >
        {speaking ? <FaStop aria-hidden="true" /> : <FaVolumeUp aria-hidden="true" />}
      </button>

      <div
        className="flex min-w-0 flex-wrap items-center justify-center gap-3"
        style={{ fontFamily: 'Arial', fontSize: 'clamp(30px, 4vw, 40px)' }}
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

      {getLearningState && changeLearningState && (
        <button
          type="button"
          onClick={() => changeLearningState(meaning)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-blue-700 bg-white shadow-[0_2px_0_0_#1d4ed8] transition-all hover:-translate-y-0.5 hover:bg-yellow-100"
          aria-label="Change learning status"
          title="Change learning status"
        >
          <OutlinedStar
            color={getStarColor(getLearningState(meaning))}
            size={24}
            outlineColor="black"
            outlineWidth={1}
          />
        </button>
      )}
    </div>
  </div>
);
