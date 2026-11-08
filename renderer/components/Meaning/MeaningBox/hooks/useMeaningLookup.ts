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
    // The worker answers lookups concurrently; a slow one for a previous word must not land on this one.
    let cancelled = false;

    const fetchCharacterData = async () => {
      if (meaning.length !== 1) {
        setMeaningCharacter(INITIAL_CHARACTER_CONTENT);
        return;
      }

      if (lang === videoConstants.japaneseLang && isKanji(meaning)) {
        const result = await window.backend.invoke('queryKanji', meaning);
        const waniResult = await window.backend.invoke('getWaniKanji', meaning);
        if (cancelled) return;
        setMeaningCharacter({ ...result, wanikani: waniResult });
        return;
      }

      if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
        const result = await window.backend.invoke('queryHanzi', meaning);
        const waniResult = await window.backend.invoke('getWaniKanji', meaning);
        if (cancelled) return;
        setMeaningCharacter({
          ...result,
          literal: meaning[0],
          wanikani: waniResult,
        });
        return;
      }

      setMeaningCharacter(INITIAL_CHARACTER_CONTENT);
    };

    const fetchMeaningData = async () => {
      const entries = (await getMeaningEntries(meaning, lang)) as MeaningContentState[];
      const nextTags = lang === videoConstants.japaneseLang
        ? await window.backend.invoke('japaneseTags')
        : null;
      if (cancelled) return;
      if (nextTags) setTags(nextTags);
      setOtherMeanings(entries);
      setMeaningContent(entries[0] ?? INITIAL_MEANING_CONTENT);
      setMeaningIndex(0);
    };

    if (meaning === '') {
      setMeaningContent(INITIAL_MEANING_CONTENT);
      setMeaningCharacter(INITIAL_CHARACTER_CONTENT);
      return () => {
        cancelled = true;
      };
    }

    // A failed lookup must not leave the previous word's content showing.
    fetchCharacterData().catch((error) => {
      console.error('Character lookup failed:', error);
      if (!cancelled) setMeaningCharacter(INITIAL_CHARACTER_CONTENT);
    });
    fetchMeaningData().catch((error) => {
      console.error('Meaning lookup failed:', error);
      if (cancelled) return;
      setOtherMeanings([]);
      setMeaningContent(INITIAL_MEANING_CONTENT);
      setMeaningIndex(0);
    });

    return () => {
      cancelled = true;
    };
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
    // No word means closed, whatever content is still held.
    isOpen: meaning !== '' && meaningContent.single.length > 0,
  };
};
