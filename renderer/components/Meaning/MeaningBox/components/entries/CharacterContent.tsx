import React from 'react';
import { defaultMeaningBoxStyling } from '../../../../../utils/CJKStyling';
import { videoConstants } from '../../../../../utils/constants';
import { KanjiEntry } from './KanjiEntry';
import { HanziEntry } from './HanziEntry';
import type { CharacterContentState } from '../../types';

type CharacterContentProps = {
  lang: string;
  meaningCharacter: CharacterContentState;
  setMeaning: (value: string) => void;
  subtitleStyling?: typeof defaultMeaningBoxStyling;
};

/** Routes single-character lookups to the kanji or hanzi renderer. */
export const CharacterContent = ({
  lang,
  meaningCharacter,
  setMeaning,
  subtitleStyling,
}: CharacterContentProps) => {
  if (!meaningCharacter.literal) {
    return null;
  }

  if (lang === videoConstants.japaneseLang) {
    return <KanjiEntry meaningKanji={meaningCharacter} />;
  }

  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    return (
      <HanziEntry
        meaningHanzi={meaningCharacter}
        setMeaning={setMeaning}
        subtitleStyling={subtitleStyling}
      />
    );
  }

  return null;
};
