import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import MeaningBox from '../components/Meaning/MeaningBox';
import {Button} from "../components/Utils/Button";
import {getMiteiruAppName} from "../utils/utils";
import {
  DIFFICULTY_INTERVAL_MS,
  dueCards,
  flashKeyAction,
  formatTimeUntil,
  GRADE_KEY_LABELS,
  nextReviewText,
  type Difficulty,
} from "../utils/flashcards";
import {isTextEntryTarget} from "../utils/keyboardTargets";
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

const VocabFlashCards: React.FC = () => {
  const {lang, tokenizeMiteiru, tokenizerModeLoaded} = useMiteiruTokenizer();
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

  // Every saved word, and the cards in this sitting: the due ones, or all of them after "Review more anyway".
  const [sortedVocab, setSortedVocab] = useState<SortedVocabEntry[]>([]);
  const [deck, setDeck] = useState<SortedVocabEntry[]>([]);
  const [reviewAll, setReviewAll] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const currentWord = deck[index] ?? null;

  const {
    setLearningLevel,
    getLearningState,
    updateTimeWithSameLevel,
    savedWords,
  } = useLearningState(lang);

  // The cards are the saved words useLearningState has loaded for this language (one load, shared;
  // this page used to load all of them a second time). Answers are saved without reloading them,
  // so the sitting's deck is built once.
  useEffect(() => {
    if (!lang || !savedWords) return;
    // Most overdue first.
    const sorted = (Object.entries(savedWords) as SortedVocabEntry[])
      .sort((a, b) => a[1].updTime - b[1].updTime);
    const due = dueCards(sorted, Date.now());
    setSortedVocab(sorted);
    setDeck(due);
    setIndex(0);
    setReviewedCount(0);
    setReviewAll(false);
    setFinished(sorted.length > 0 && due.length === 0);
    setLoaded(true);
  }, [lang, savedWords]);

  // Cards are kept per language, and the language is chosen on Home.
  const noLanguage = tokenizerModeLoaded && !lang;

  const reviewMore = useCallback(() => {
    setDeck(sortedVocab);
    setIndex(0);
    setReviewAll(true);
    setFinished(false);
    setShowAnswer(false);
  }, [sortedVocab]);

  const handleAnswer = useCallback((difficulty: Difficulty) => {
    if (!currentWord) return;
    const [content, state] = currentWord;
    const newUpdTime = Date.now() + DIFFICULTY_INTERVAL_MS[difficulty];
    updateTimeWithSameLevel(content, newUpdTime);
    setSortedVocab((old) => old.map((word) =>
        word[0] === content ? [content, {...state, updTime: newUpdTime}] : word
    ));
    setReviewedCount((count) => count + 1);
    setShowAnswer(false);
    // The due deck ends after its last card; the review-all deck wraps around.
    if (index + 1 >= deck.length && !reviewAll) {
      setFinished(true);
      return;
    }
    setIndex((index + 1) % deck.length);
  }, [currentWord, deck.length, index, reviewAll, updateTimeWithSameLevel]);

  // Space shows the answer; 1-4 grade it. Not while typing in a field.
  useEffect(() => {
    if (!currentWord || finished) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTextEntryTarget(event.target)) return;
      const action = flashKeyAction(event.key, showAnswer);
      if (!action) return;
      event.preventDefault();
      if (action.type === 'show') setShowAnswer(true);
      else handleAnswer(action.difficulty);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentWord, finished, showAnswer, handleAnswer]);

  const nextReview = finished ? nextReviewText(sortedVocab, Date.now()) : null;

  const customComponent = useMemo(() => {
    if (!currentWord) return null;

    const [, state] = currentWord;
    const now = Date.now();
    const gradeButton = (difficulty: Difficulty, label: string, title?: string) => (
        <Button type="secondary" onPress={() => handleAnswer(difficulty)} title={title}>
          {label} <kbd className="ml-1 rounded border border-current px-1 text-[10px] font-bold opacity-70">
          {GRADE_KEY_LABELS[difficulty]}</kbd>
        </Button>
    );

    return (
        <div className={`${HOME_SECTION} m-3 flex flex-col items-center gap-2 p-3 text-center text-blue-950`}>
          <div className="text-sm font-bold">
            Card {index + 1} of {deck.length}
          </div>
          <div className="text-xs text-blue-800">
            {state.updTime > now ? `Not due yet · due in ${formatTimeUntil(state.updTime, now)}` : 'Due now'}
          </div>
          {!showAnswer ? (
              <Button type="primary" onPress={() => setShowAnswer(true)}>
                Show answer <kbd className="ml-1 rounded border border-current px-1 text-[10px] font-bold opacity-70">Space</kbd>
              </Button>
          ) : (
              <>
                <div className={'flex flex-row flex-wrap justify-center gap-2'}>
                  {gradeButton('hard', 'Hard 🧠', 'See it again tomorrow')}
                  {gradeButton('good', 'Good 😊', 'See it again in 3 days')}
                  {gradeButton('easy', 'Easy 😎', 'See it again in a week')}
                  {gradeButton('banish', 'Banish 👻', 'I know this, hide it for a year')}
                </div>
                <div className="text-[11px] text-blue-800">Banish: I know this, hide it for a year.</div>
              </>
          )}
        </div>
    );
  }, [currentWord, index, deck.length, showAnswer, handleAnswer]);

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
                    {sortedVocab.length === 0 ? 'Review the words you learn'
                      : finished ? 'All done for today'
                      : reviewAll ? `${sortedVocab.length} words` : `${deck.length - index} due today`}
                  </div>
                </div>
              </div>
              <Button type="secondary" size="small" onPress={() => router.push('/home')}
                      title="Back to the home page (Ctrl + H)">
                ← Home
              </Button>
            </header>
            {noLanguage && (
                <div className={HOME_BODY}>
                  <section className={HOME_SECTION}>
                    <div className={HOME_SECTION_LABEL}>Choose a language first</div>
                    <div className="space-y-3 bg-white px-4 py-3 text-sm text-blue-900">
                      <p>
                        Cards are kept for each language. On Home, pick the language you’re learning and press
                        Flashcards.
                      </p>
                      <Button type="primary" onPress={() => router.push('/home')}>Choose a language</Button>
                    </div>
                  </section>
                </div>
            )}
            {loaded && sortedVocab.length === 0 && (
                <div className={HOME_BODY}>
                  <section className={HOME_SECTION}>
                    <div className={HOME_SECTION_LABEL}>No cards yet</div>
                    <div className="space-y-3 bg-white px-4 py-3 text-sm text-blue-900">
                      <p>
                        Cards are the words you save while watching or reading. Right-click a word in the subtitles,
                        or choose Learning or Known in its popup; it shows up here to review.
                      </p>
                      <Button type="primary" onPress={() => router.push('/video')}>Open a video</Button>
                    </div>
                  </section>
                </div>
            )}
            {finished && sortedVocab.length > 0 && (
                <div className={HOME_BODY}>
                  <section className={HOME_SECTION}>
                    <div className={HOME_SECTION_LABEL}>All done for today</div>
                    <div className="space-y-3 bg-white px-4 py-3 text-sm text-blue-900">
                      <p>
                        {reviewedCount} card{reviewedCount === 1 ? '' : 's'} reviewed
                        {nextReview ? ` · ${nextReview}` : ''}
                      </p>
                      <Button type="secondary" onPress={reviewMore}>Review more anyway</Button>
                    </div>
                  </section>
                </div>
            )}
          </section>
          {sortedVocab.length === 0 || finished ? null : (
              currentWord && (
                  <MeaningBox
                      lang={lang}
                      meaning={currentWord[0]}
                      setMeaning={() => {
                      }}
                      tokenizeMiteiru={tokenizeMiteiru}
                      sidebarInsets={cardInsets}
                      customComponent={customComponent}
                      setLearningLevel={setLearningLevel}
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