import React, { useMemo } from 'react';
import { HanziSentence } from '../../../../Subtitle/Sentence';
import { defaultMeaningBoxStyling } from '../../../../../utils/CJKStyling';
import { videoConstants } from '../../../../../utils/constants';
import MakeMeAHanziDisplay from '../../../MakeMeAHanziDisplay';
import HanziStrokeStepsRow from '../../../HanziStrokeStepsRow';
import { MEANING_GLOSS_INDEX, MEANING_WORD_DISPLAY } from '../../../meaningBoxTheme';
import { MEANING_KANJI_CLASS } from '../../constants';
import { ExternalLink } from '../shared/ExternalLink';
import { EntryFieldList } from './EntryPrimitives';
import { CharacterEntryShell } from './EntryLayout';
import { MeaningMnemonics } from '../wanikani/MeaningMnemonics';
import { WaniKaniRadicalChip } from '../wanikani/WaniKaniRadicalChip';

type HanziEntryProps = {
  meaningHanzi: Record<string, any>;
  setMeaning: (value: string) => void;
  subtitleStyling?: typeof defaultMeaningBoxStyling;
};

/** Cantonese / Mandarin single-character entry with decomposition tree. */
export const HanziEntry = ({
  meaningHanzi,
  setMeaning,
  subtitleStyling = defaultMeaningBoxStyling,
}: HanziEntryProps) => {
  const metadataTags = [
    `CantoDict ${meaningHanzi.cantodict_id}`,
    meaningHanzi.dialect ? `${meaningHanzi.dialect} dialect` : '',
    meaningHanzi.stroke_count ? `${meaningHanzi.stroke_count} strokes` : '',
    meaningHanzi.freq ? `${meaningHanzi.freq} appearances` : '',
  ].filter(Boolean) as string[];

  const detailFields = useMemo(() => {
    const wanikaniRadicals = meaningHanzi.wanikani
      ? meaningHanzi.wanikani.component_subject_ids.map((radicalName: string) => (
          <WaniKaniRadicalChip key={radicalName} slug={radicalName} />
        ))
      : [];
    const wanikaniMnemonics = meaningHanzi.wanikani
      ? [<MeaningMnemonics key="mnemonic" content={meaningHanzi.wanikani.meaning_mnemonic} />]
      : [];

    return {
      urls: [
        <ExternalLink
          key="cantonese"
          urlBase="https://cantonese.org/search.php?q="
          displayText="Cantonese.org"
          query={meaningHanzi.literal}
        />,
      ],
      pinyin: meaningHanzi.pinyin,
      decomposition: meaningHanzi.decomposition
        ? Array.from(meaningHanzi.decomposition)
        : [],
      radical: meaningHanzi.radical ? Array.from(meaningHanzi.radical) : [],
      jyutping: meaningHanzi.jyutping,
      etymology:
        meaningHanzi.etymology && meaningHanzi.etymology.type
          ? [`${meaningHanzi.etymology.type} | ${meaningHanzi.etymology.hint}`]
          : [],
      notes: meaningHanzi.notes,
      variants: meaningHanzi.variants,
      similar: meaningHanzi.similar,
      'Wanikani Radicals': wanikaniRadicals,
      'Wanikani Mnemonics': wanikaniMnemonics,
    };
  }, [meaningHanzi]);

  return (
    <CharacterEntryShell tags={metadataTags}>
      <div className="flex flex-row">
        <MakeMeAHanziDisplay character={meaningHanzi.literal} />
        <div className="flex flex-col gap-3 p-4">
          <HanziStrokeStepsRow character={meaningHanzi.literal} />

          <div className="flex flex-row flex-wrap gap-3 text-4xl">
            {meaningHanzi.decomposition &&
              Array.from(meaningHanzi.decomposition).map((value: string, index) => {
                if (!value.match(videoConstants.cjkRegex)) {
                  return null;
                }
                return (
                  <div key={`${index}-div`} className={MEANING_WORD_DISPLAY}>
                    <HanziSentence
                      key={index}
                      origin={value}
                      setMeaning={setMeaning}
                      extraClass={MEANING_KANJI_CLASS}
                      subtitleStyling={subtitleStyling}
                    />
                  </div>
                );
              })}
          </div>

          <div className="flex flex-col gap-1">
            {(meaningHanzi.meaning ? meaningHanzi.meaning : []).map((val: string, idx: number) => (
              <div key={idx} className="font-semibold text-red-700">
                <span className={MEANING_GLOSS_INDEX}>{idx + 1}.</span>
                {val}
              </div>
            ))}
          </div>

          <EntryFieldList fields={detailFields} skipEmptyArrays />
        </div>
      </div>
    </CharacterEntryShell>
  );
};
