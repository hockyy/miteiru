import React from 'react';
import { toHiragana } from 'wanakana';
import KanjiVGDisplay from '../../../KanjiVGDisplay';
import { ExternalLink } from '../shared/ExternalLink';
import { EntryFieldList } from './EntryPrimitives';
import { CharacterEntryShell } from './EntryLayout';
import { MeaningMnemonics } from '../wanikani/MeaningMnemonics';
import { WaniKaniRadicalChip } from '../wanikani/WaniKaniRadicalChip';

type KanjiEntryProps = {
  meaningKanji: Record<string, any>;
};

/** Full kanji dictionary page (stroke diagram, readings, external links, WaniKani). */
export const KanjiEntry = ({ meaningKanji }: KanjiEntryProps) => {
  const jlpt = meaningKanji.misc.jlptLevel;
  const grade = meaningKanji.misc.grade;
  const frequency = meaningKanji.misc.frequency;
  const ucs = meaningKanji.codepoints
    .filter((val: { type: string }) => val.type === 'ucs')
    .map((val: { value: string }) => val.value);

  const metadataTags = [
    `${meaningKanji.literal}`,
    jlpt ? `JLPT N${jlpt}` : null,
    grade ? `Grade ${grade}` : null,
    frequency ? `Top ${meaningKanji.misc.frequency} kanji` : null,
    `${meaningKanji.misc.strokeCounts[0]} writing strokes`,
  ].filter(Boolean) as string[];

  const groups = meaningKanji.readingMeaning.groups.map((member: Record<string, any>) => {
    const onyomi = member.readings
      .filter((val: { type: string }) => val.type === 'ja_on')
      .map((val: { value: string }) => `${val.value}『${toHiragana(val.value)}』`);
    const kunyomi = member.readings
      .filter((val: { type: string }) => val.type === 'ja_kun')
      .map((val: { value: string }) => val.value);
    const meanings = member.meanings
      .filter((val: { lang: string }) => val.lang === 'en')
      .map((val: { value: string }) => val.value);

    const urls = [
      <ExternalLink
        key="jisho"
        urlBase="https://jisho.org/search/"
        displayText="Jisho"
        query={meaningKanji.literal}
      />,
      <ExternalLink
        key="wanikani"
        urlBase="https://www.wanikani.com/kanji/"
        displayText="Wanikani"
        query={meaningKanji.literal}
      />,
      <ExternalLink
        key="tangorin"
        urlBase="https://tangorin.com/kanji/"
        displayText="Tangorin"
        query={meaningKanji.literal}
      />,
      <ExternalLink
        key="koohii"
        urlBase="https://kanji.koohii.com/study/kanji/"
        displayText="Koohii"
        query={meaningKanji.literal}
      />,
    ];

    return {
      meanings,
      '音読み (Onyomi)': onyomi,
      '訓読み (Kunyomi)': kunyomi,
      urls,
      Wanikani: meaningKanji.wanikani
        ? meaningKanji.wanikani.component_subject_ids.map((radicalName: string) => (
            <WaniKaniRadicalChip key={radicalName} slug={radicalName} />
          ))
        : [],
      Mnemonics: meaningKanji.wanikani
        ? [<MeaningMnemonics key="mnemonic" content={meaningKanji.wanikani.meaning_mnemonic} />]
        : [],
    };
  });

  return (
    <CharacterEntryShell tags={metadataTags}>
      <div className="flex flex-row">
        {ucs.length > 0 && <KanjiVGDisplay filename={`0${ucs[0]}.svg`} />}
        {groups.map((group: Record<string, unknown>, index: number) => (
          <div key={index} className="m-3 flex flex-col gap-2">
            <EntryFieldList fields={group} />
          </div>
        ))}
      </div>
    </CharacterEntryShell>
  );
};
