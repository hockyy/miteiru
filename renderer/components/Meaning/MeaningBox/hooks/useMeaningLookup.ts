import { useEffect, useState } from 'react';
import { isKanji } from 'wanakana';
import { videoConstants } from '../../../../utils/constants';
import { getMeaningEntries } from '../../meaningEntries';
import {
  INITIAL_CHARACTER_CONTENT,
  INITIAL_MEANING_CONTENT,
} from '../constants';
import type {
  CharacterContentState,
  MeaningContentState,
} from '../types';

/**
 * Loads dictionary + single-character data whenever `meaning` or `lang` changes.
 * Resets state when the box is closed (`meaning === ''`).
 */
export const useMeaningLookup = (meaning: string, lang: string, showMeaning: boolean) => {
  const [meaningContent, setMeaningContent] =
    useState<MeaningContentState>(INITIAL_MEANING_CONTENT);
  const [meaningCharacter, setMeaningCharacter] =
    useState<CharacterContentState>(INITIAL_CHARACTER_CONTENT);
  const [otherMeanings, setOtherMeanings] = useState<MeaningContentState[]>([]);
  const [meaningIndex, setMeaningIndex] = useState(0);
  const [tags, setTags] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchCharacterData = async () => {
      if (meaning.length !== 1) {
        setMeaningCharacter(INITIAL_CHARACTER_CONTENT);
        return;
      }

      if (lang === videoConstants.japaneseLang && isKanji(meaning)) {
        const result = await window.ipc.invoke('queryKanji', meaning);
        const waniResult = await window.ipc.invoke('getWaniKanji', meaning);
        setMeaningCharacter({ ...result, wanikani: waniResult });
        return;
      }

      if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
        const result = await window.ipc.invoke('queryHanzi', meaning);
        const waniResult = await window.ipc.invoke('getWaniKanji', meaning);
        setMeaningCharacter({
          ...result,
          literal: meaning[0],
          wanikani: waniResult,
        });
      }
    };

    const fetchMeaningData = async () => {
      const entries = (await getMeaningEntries(meaning, lang)) as MeaningContentState[];
      if (lang === videoConstants.japaneseLang) {
        setTags(await window.ipc.invoke('japaneseTags'));
      }
      setOtherMeanings(entries);
      setMeaningContent(entries[0] ?? INITIAL_MEANING_CONTENT);
      setMeaningIndex(0);
    };

    if (meaning === '') {
      setMeaningContent(INITIAL_MEANING_CONTENT);
      setMeaningCharacter(INITIAL_CHARACTER_CONTENT);
      return;
    }

    fetchCharacterData();
    fetchMeaningData();
  }, [lang, meaning, showMeaning]);

  const goToPreviousMeaning = () => {
    if (meaningIndex <= 0) {
      return;
    }
    setMeaningIndex((current) => {
      const nextIndex = current - 1;
      setMeaningContent(otherMeanings[nextIndex]);
      return nextIndex;
    });
  };

  const goToNextMeaning = () => {
    if (meaningIndex >= otherMeanings.length - 1) {
      return;
    }
    setMeaningIndex((current) => {
      const nextIndex = current + 1;
      setMeaningContent(otherMeanings[nextIndex]);
      return nextIndex;
    });
  };

  return {
    meaningContent,
    meaningCharacter,
    otherMeanings,
    meaningIndex,
    tags,
    goToPreviousMeaning,
    goToNextMeaning,
    isOpen: meaningContent.single.length > 0,
  };
};
