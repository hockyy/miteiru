import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import MeaningBox from '../components/Meaning/MeaningBox';
import {Button} from "../components/Utils/Button";
import {getMiteiruAppName, getRelativeTime} from "../utils/utils";
import useLearningState from "../hooks/useLearningState";
import useLearningKeyBind from "../hooks/useLearningKeyBind";
import {
  HOME_BODY,
  HOME_HEADER,
  HOME_ICON_BADGE,
  HOME_SECTION,
  HOME_SECTION_LABEL,
  HOME_SHELL,
  UI_PAGE_BG
} from "../components/UI/miteiruUiTheme";

interface LearningStateEntry {
  level: number;
  updTime: number;
}

type SortedVocabEntry = [string, LearningStateEntry];

type Difficulty = 'hard' | 'good' | 'easy' | 'banish';

const VocabFlashCards: React.FC = () => {
  const {lang, tokenizeMiteiru} = useMiteiruTokenizer();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  // The card panel is an overlay; it starts below the header so Home stays reachable.
  const headerRef = useRef<HTMLElement>(null);
  const [headerBottom, setHeaderBottom] = useState(0);
  useLayoutEffect(() => {
    const update = () => setHeaderBottom(Math.ceil(headerRef.current?.getBoundingClientRect().bottom ?? 0));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const cardInsets = useMemo(() => ({top: `${headerBottom + 8}px`}), [headerBottom]);

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
      // Most overdue first, as handleAnswer keeps them.
      const sorted = Object.entries(loadedState).sort((a, b) =>
          (a[1] as LearningStateEntry).updTime - (b[1] as LearningStateEntry).updTime
      ) as SortedVocabEntry[];
      setSortedVocab(sorted);
      if (sorted.length > 0) {
        setCurrentWord(sorted[0]);
      }
      setLoaded(true);
    } catch (error) {
      console.error('Error loading vocabulary:', error);
      setLoaded(true);
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
        <div className={`${HOME_SECTION} m-3 flex flex-col items-center gap-2 p-3 text-center text-blue-950`}>
          <div className="text-sm font-bold">
            Card {index + 1} of {sortedVocab.length}
          </div>
          <div className="text-xs text-blue-800">
            Review due {getRelativeTime(state.updTime)} · {new Date(state.updTime).toLocaleString()}
          </div>
          {!showAnswer ? (
              <Button type="primary" onPress={() => setShowAnswer(true)}>
                Show answer
              </Button>
          ) : (
              <div className={'flex flex-row flex-wrap justify-center gap-2'}>
                <Button type="secondary"
                               onPress={() => handleAnswer('hard')}>
                  Hard 🧠
                </Button>
                <Button type="secondary" onPress={() => handleAnswer('good')}>
                  Good 😊
                </Button>
                <Button type="secondary" onPress={() => handleAnswer('easy')}>
                  Easy 😎
                </Button>
                <Button type="secondary" onPress={() => handleAnswer('banish')}>
                  Banish 👻
                </Button>
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
          <title>{getMiteiruAppName()} - Vocabulary Flash Cards</title>
        </Head>
        <div className={`${UI_PAGE_BG} flex flex-col items-center gap-4`}>
          <section className={HOME_SHELL} ref={headerRef}>
            <header className={HOME_HEADER}>
              <div className="flex items-center gap-3">
                <div className={HOME_ICON_BADGE}>🃏</div>
                <div>
                  <div className="text-sm font-black tracking-tight text-blue-950">Flashcards</div>
                  <div className="text-[11px] font-bold text-blue-800">
                    {sortedVocab.length > 0 ? `${sortedVocab.length} words to review` : 'Review the words you learn'}
                  </div>
                </div>
              </div>
              <Button type="secondary" size="small" onPress={() => router.push('/home')}
                      title="Back to the home page (Ctrl + H)">
                ← Home
              </Button>
            </header>
            {loaded && sortedVocab.length === 0 && (
                <div className={HOME_BODY}>
                  <section className={HOME_SECTION}>
                    <div className={HOME_SECTION_LABEL}>No cards yet</div>
                    <div className="space-y-3 bg-white px-4 py-3 text-sm text-blue-900">
                      <p>
                        Cards are the words you mark while watching or reading. Click a word in a subtitle and
                        set how well you know it; it shows up here to review.
                      </p>
                      <Button type="primary" onPress={() => router.push('/video')}>Open a video</Button>
                    </div>
                  </section>
                </div>
            )}
          </section>
          {sortedVocab.length === 0 ? null : (
              currentWord && (
                  <MeaningBox
                      lang={lang}
                      meaning={currentWord[0]}
                      setMeaning={() => {
                      }}
                      tokenizeMiteiru={tokenizeMiteiru}
                      sidebarInsets={cardInsets}
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