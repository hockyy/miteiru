import React, { useEffect, useMemo, useState } from 'react';
import { ChineseSentence, JapaneseSentence } from '../Subtitle/Sentence';
import { getSubtitleTokenPresentation } from '../Subtitle/subtitleLanguageSupport';
import { CJKStyling, defaultNoteExampleStyling } from '../../utils/CJKStyling';

type TokenizedWord = {
  origin: string;
  separation: unknown[];
  basicForm?: string;
};

interface NoteExampleSentenceProps {
  sentence: string;
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
  setMeaning?: (term: string) => void;
  subtitleStyling?: CJKStyling;
  className?: string;
}

export const NoteExampleSentence: React.FC<NoteExampleSentenceProps> = ({
  sentence,
  lang,
  tokenizeMiteiru,
  setMeaning = () => {},
  subtitleStyling,
  className = '',
}) => {
  const [tokens, setTokens] = useState<TokenizedWord[] | null>(null);

  const styling = useMemo(
    () => subtitleStyling ?? defaultNoteExampleStyling,
    [subtitleStyling],
  );

  useEffect(() => {
    let cancelled = false;
    const trimmed = sentence.trim();

    if (!trimmed) {
      setTokens([]);
      return () => {
        cancelled = true;
      };
    }

    setTokens(null);

    tokenizeMiteiru(trimmed)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setTokens(Array.isArray(result) ? result as TokenizedWord[] : []);
      })
      .catch((error) => {
        console.error('Failed to tokenize example sentence:', error);
        if (!cancelled) {
          setTokens([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sentence, tokenizeMiteiru, lang]);

  if (!sentence.trim()) {
    return null;
  }

  if (tokens === null) {
    return <span className={`text-black/70 ${className}`}>{sentence}</span>;
  }

  if (tokens.length === 0) {
    return <span className={`text-black ${className}`}>{sentence}</span>;
  }

  return (
    <span className={`note-example-sentence inline leading-relaxed ${className}`}>
      {tokens.map((token, index) => {
        const presentation = getSubtitleTokenPresentation(token);
        const validBasicForm = token.basicForm != '' && token.basicForm != '*';
        const SentenceComponent = presentation.sentenceKind === 'chinese'
          ? ChineseSentence
          : JapaneseSentence;

        return (
          <React.Fragment key={`${token.origin}-${index}`}>
            <SentenceComponent
              origin={token.origin}
              separation={token.separation}
              setMeaning={setMeaning}
              extraClass="meaning-note-example unselectable"
              subtitleStyling={styling}
              basicForm={validBasicForm ? token.basicForm : ''}
              wordMeaning=""
            />
            {index + 1 < tokens.length && styling.showSpace ? ' ' : ''}
          </React.Fragment>
        );
      })}
    </span>
  );
};
