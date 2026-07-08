import React from 'react';
import { Button } from '../../../Utils/Button';
import { FaVolumeUp } from 'react-icons/fa';
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
    <Button type="primary" disabled={meaningIndex === 0} onPress={onPrevious}>
      Previous
    </Button>

    <div
      className="flex flex-wrap items-center justify-center gap-5"
      style={{ fontFamily: 'Arial', fontSize: '40px' }}
    >
      <div className="mr-4">
        <Button onPress={onSpeak} disabled={!speechSupported}>
          {speaking ? 'Stop' : <FaVolumeUp />}
        </Button>
      </div>

      {romajiedData.map(({ key, romajied }) => (
        <RomajiedContent
          key={key}
          romajied={romajied}
          lang={lang}
          setMeaning={setMeaning}
          subtitleStyling={subtitleStyling}
        />
      ))}

      {getLearningState && changeLearningState && (
        <button
          type="button"
          onClick={() => changeLearningState(meaning)}
          className="ml-4"
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

    <Button
      type="primary"
      disabled={meaningIndex >= otherMeaningsCount - 1}
      onPress={onNext}
    >
      Next
    </Button>
  </div>
);
