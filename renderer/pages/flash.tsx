import React, {useCallback, useEffect, useMemo, useState} from 'react';
import Head from 'next/head';
import {ipcRenderer} from 'electron';
import "react-awesome-button/dist/styles.css";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import MeaningBox from '../components/Meaning/MeaningBox';
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import {AwesomeButton} from "react-awesome-button";

const getRelativeTime = (timestamp) => {
  const now = new Date().getTime();
  const updatedDate = new Date(timestamp).getTime();
  const diffTime = Math.abs(now - updatedDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};

const VocabFlashCards = () => {
  const {lang, tokenizeMiteiru} = useMiteiruTokenizer();
  useLearningKeyBind(() => {
  }, () => {
  }, () => {
  });

  const [sortedVocab, setSortedVocab] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [index, setIndex] = useState(0);

  const loadVocabulary = useCallback(async () => {
    try {
      const loadedState = await ipcRenderer.invoke('loadLearningState', lang);
      const sorted = Object.entries(loadedState).sort((a: any[], b: any[]) => b[1].updTime - a[1].updTime);
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
  }, [index, sortedVocab]);

  const showPreCard = useCallback(() => {
    const prevIndex = (index - 1 + sortedVocab.length) % sortedVocab.length;
    setCurrentWord(sortedVocab[prevIndex]);
    setIndex(prevIndex);
  }, [index, sortedVocab]);

  const customComponent = useMemo(() => {
    return currentWord ? (
        <div className={'flex flex-col text-center bg-blue-200 gap-2 p-2 m-3'}>
          <div className={"font-bold"}>
            Card No. {index}
          </div>
          <div className="text-sm text-blue-900 font-bold">
            Last updated: {new Date(currentWord[1].updTime).toLocaleString()}
          </div>
          <div className="text-sm text-blue-700 italic">
            ({getRelativeTime(currentWord[1].updTime)})
          </div>
          <div className={'flex flex-row justify-center gap-4'}>
            <AwesomeButton type="secondary" onPress={showPreCard}>
              Previous Card
            </AwesomeButton>
            <AwesomeButton type="secondary" onPress={showNextCard}>
              Next Card
            </AwesomeButton>
          </div>
        </div>
    ) : <></>
  }, [currentWord, index, showNextCard, showPreCard]);

  return (
      <React.Fragment>
        <Head>
          <title>Vocabulary Flash Cards</title>
        </Head>
        <div
            className="flex flex-col items-center justify-center bg-blue-50 text-black min-h-screen p-6 gap-3">
          <h1 className="text-3xl font-bold mb-6">Vocabulary Flash Cards</h1>
          No Cards
          {currentWord && (
              <MeaningBox
                  lang={lang}
                  meaning={currentWord[0]}
                  setMeaning={() => {
                  }}
                  tokenizeMiteiru={tokenizeMiteiru}
                  customComponent={customComponent}
              />
          )}
        </div>
      </React.Fragment>
  );
};

export default VocabFlashCards;