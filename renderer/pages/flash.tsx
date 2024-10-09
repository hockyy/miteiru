import React, {useCallback, useEffect, useMemo, useState} from 'react';
import Head from 'next/head';
import "react-awesome-button/dist/styles.css";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import MeaningBox from '../components/Meaning/MeaningBox';
import {AwesomeButton} from "react-awesome-button";
import {getRelativeTime} from "../utils/utils";
import useLearningState from "../hooks/useLearningState";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import 'react-awesome-button/dist/styles.css';

interface LearningStateEntry {
  level: number;
  updTime: number;
}

type SortedVocabEntry = [string, LearningStateEntry];

type Difficulty = 'hard' | 'good' | 'easy' | 'banish';

const VocabFlashCards: React.FC = () => {
  const {lang, tokenizeMiteiru} = useMiteiruTokenizer();

  const [sortedVocab, setSortedVocab] = useState<SortedVocabEntry[]>([]);
  const [currentWord, setCurrentWord] = useState<SortedVocabEntry | null>(null);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const {
    changeLearningState,
    getLearningState,
    updateTimeWithSameLevel,
  } = useLearningState(lang);

  const loadVocabulary = useCallback(async () => {
    try {
      if (!lang) return;
      const loadedState = await window.ipc.invoke('loadLearningState', lang);
      const sorted = Object.entries(loadedState).sort((a, b) =>
          (b[1] as LearningStateEntry).updTime - (a[1] as LearningStateEntry).updTime
      ) as SortedVocabEntry[];
      setSortedVocab(sorted);
      if (sorted.length > 0) {
        setCurrentWord(sorted[0]);
      }
    } catch (error) {
      console.error('Error loading vocabulary:', error);
    }
  }, [lang]);

  useEffect(() => {
    loadVocabulary();
  }, [lang, loadVocabulary]);

  const showNextCard = useCallback(() => {
    const nextIndex = (index + 1) % sortedVocab.length;
    setCurrentWord(sortedVocab[nextIndex]);
    setIndex(nextIndex);
    setShowAnswer(false);
  }, [index, sortedVocab]);
  const handleAnswer = useCallback((difficulty: Difficulty) => {
    if (currentWord) {
      const [content, state] = currentWord;
      const now = Date.now();
      let interval: number;

      switch (difficulty) {
        case 'hard':
          interval = 24 * 60 * 60 * 1000; // 1 day
          break;
        case 'good':
          interval = 3 * 24 * 60 * 60 * 1000; // 3 days
          break;
        case 'easy':
          interval = 7 * 24 * 60 * 60 * 1000; // 7 days
          break;
        case 'banish':
          interval = 365 * 24 * 60 * 60 * 1000; // 1 year lmao
          break;
      }

      const newUpdTime = now + interval;
      updateTimeWithSameLevel(content, newUpdTime);

      const updatedVocab = sortedVocab.map(word =>
          word[0] === content ? [content, {...state, updTime: newUpdTime}] : word
      );

      const newSortedVocab = updatedVocab.sort((a, b) => {
        if (typeof a[1] === 'string' || typeof b[1] === 'string') {
          console.error('Unexpected state format:', a[1], b[1]);
          return 0;
        }
        return a[1].updTime - b[1].updTime;
      });
      setSortedVocab(newSortedVocab as SortedVocabEntry[]);

      showNextCard();
    }
  }, [currentWord, sortedVocab, updateTimeWithSameLevel, showNextCard]);
  const customComponent = useMemo(() => {
    if (!currentWord) return null;

    const [, state] = currentWord;

    return (
        <div className={'flex flex-col text-center bg-blue-200 gap-2 p-2 m-3'}>
          <div className={"font-bold"}>
            Card No. {index + 1} of {sortedVocab.length}
          </div>
          <div className="text-sm text-blue-900 font-bold">
            Next review: {new Date(state.updTime).toLocaleString()}
          </div>
          <div className="text-sm text-blue-700 italic">
            ({getRelativeTime(state.updTime)})
          </div>
          {!showAnswer ? (
              <AwesomeButton type="primary" onPress={() => setShowAnswer(true)}>
                Show Answer
              </AwesomeButton>
          ) : (
              <div className={'flex flex-row justify-center gap-4'}>
                <AwesomeButton type="secondary"
                               onPress={() => handleAnswer('hard')}>
                  Hard 🧠
                </AwesomeButton>
                <AwesomeButton type="secondary" onPress={() => handleAnswer('good')}>
                  Good 😊
                </AwesomeButton>
                <AwesomeButton type="secondary" onPress={() => handleAnswer('easy')}>
                  Easy 😎
                </AwesomeButton>
                <AwesomeButton type="secondary" onPress={() => handleAnswer('banish')}>
                  Banish 👻
                </AwesomeButton>
              </div>
          )}
        </div>
    );
  }, [currentWord, index, sortedVocab.length, showAnswer, handleAnswer]);

  useLearningKeyBind(() => {
  }, () => {
  }, () => {
  });
  return (
      <React.Fragment>
        <Head>
          <title>Vocabulary Flash Cards</title>
        </Head>
        <div
            className="flex flex-col items-center justify-center bg-blue-50 text-black min-h-screen p-6 gap-3">
          <h1 className="text-3xl font-bold mb-6">Vocabulary Flash Cards</h1>
          {sortedVocab.length === 0 ? (
              <div>No Cards Available</div>
          ) : (
              currentWord && (
                  <MeaningBox
                      lang={lang}
                      meaning={currentWord[0]}
                      setMeaning={() => {
                      }}
                      tokenizeMiteiru={tokenizeMiteiru}
                      customComponent={customComponent}
                      changeLearningState={changeLearningState}
                      getLearningState={getLearningState}
                      showMeaning={showAnswer}
                  />
              )
          )}
        </div>
      </React.Fragment>
  );
};

export default VocabFlashCards;