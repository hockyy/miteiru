import React from 'react';
import {
  HanziSentence,
  KanjiSentence,
  TokenLikeSentence,
} from '../../../Subtitle/Sentence';
import { defaultMeaningBoxStyling } from '../../../../utils/CJKStyling';
import { videoConstants } from '../../../../utils/constants';
import { MEANING_WORD_DISPLAY } from '../../meaningBoxTheme';
import { MEANING_KANJI_CLASS } from '../constants';
import { PitchAccentBadge } from './PitchAccentBadge';
import { LangDictionaryLink } from './shared/LangDictionaryLink';
import type { RomajiedToken } from '../types';

type RomajiedContentProps = {
  romajied: RomajiedToken[];
  lang: string;
  setMeaning: (value: string) => void;
  subtitleStyling?: typeof defaultMeaningBoxStyling;
};

/** Large clickable headword with reading ruby + external dictionary link. */
export const RomajiedContent = ({
  romajied,
  lang,
  setMeaning,
  subtitleStyling = defaultMeaningBoxStyling,
}: RomajiedContentProps) => {
  const queryText = romajied.reduce((acc, token) => acc + token.origin, '');
  const hiraganaReading = romajied
    .flatMap((token) =>
      Array.isArray(token?.separation)
        ? token.separation.map((part) => part?.hiragana ?? '')
        : [],
    )
    .join('');

  return (
    <div className="flex min-w-0 flex-col items-center justify-between gap-2.5">
      <div className={MEANING_WORD_DISPLAY}>
        {lang === videoConstants.japaneseLang &&
          romajied.map((token, idx) => (
            <KanjiSentence
              key={idx}
              origin={token.origin}
              setMeaning={setMeaning}
              separation={token.separation}
              extraClass={MEANING_KANJI_CLASS}
              subtitleStyling={subtitleStyling}
            />
          ))}

        {(lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang) &&
          romajied.map((token, idx) => (
            <HanziSentence
              key={idx}
              origin={token.origin}
              pinyin={(lang === videoConstants.chineseLang ? token.pinyin : token.jyutping)
                ?.split(' ')}
              setMeaning={setMeaning}
              extraClass={MEANING_KANJI_CLASS}
              subtitleStyling={subtitleStyling}
            />
          ))}

        {lang === videoConstants.vietnameseLang &&
          romajied.map((token, idx) => (
            <TokenLikeSentence
              key={idx}
              origin={token.origin}
              reading={[]}
              separation={token.separation}
              setMeaning={setMeaning}
              extraClass={MEANING_KANJI_CLASS}
              subtitleStyling={subtitleStyling}
            />
          ))}
      </div>
      {lang === videoConstants.japaneseLang && hiraganaReading && (
        <PitchAccentBadge surface={queryText} reading={hiraganaReading} />
      )}
      <LangDictionaryLink lang={lang} queryText={queryText} />
    </div>
  );
};
