import React, {useCallback} from 'react';
import {getColorGradient, getRelativeTime} from '../../utils/utils';
import {Key} from '../VideoPlayer/KeyboardHelp';
import {Button} from '../Utils/Button';
import {HOME_BODY, HOME_HEADER, HOME_ICON_BADGE, HOME_SECTION, HOME_SECTION_LABEL, HOME_SHELL} from '../UI/miteiruUiTheme';

interface WordOfTheDayProps {
  dailyWords: Array<{
    word: string;
    level: number;
    updTime: number;
    reading?: string;
    meaning?: string;
  }>;
  dateString: string;
  lang: string;
  setMeaning: (word: string) => void;
  tokenizeMiteiru?: (word: string) => Promise<any>;
  onRefresh?: () => void;
  // Opens the system file picker for videos and subtitles.
  onOpenFiles: () => void;
  onHome: () => void;
}

/** The video page before a video is loaded: how to open one, and learned words to review. */
const WordOfTheDay: React.FC<WordOfTheDayProps> = ({
  dailyWords,
  setMeaning,
  onOpenFiles,
  onHome,
}) => {
  const handleWordClick = useCallback((word: string) => {
    setMeaning(word);
  }, [setMeaning]);

  return (
    // Above the full-window drop zone, so its buttons and words take clicks; drops still reach it.
    <div className="relative z-[5] flex min-h-screen flex-col items-center gap-6 bg-gradient-to-b from-blue-50 via-white to-blue-50 px-4 py-8 text-blue-950">
      <section className={HOME_SHELL}>
        <header className={HOME_HEADER}>
          <div className="flex items-center gap-3">
            <div className={HOME_ICON_BADGE}>🐸</div>
            <div className="text-sm font-black tracking-tight text-blue-950">Watch</div>
          </div>
          <Button type="secondary" size="small" onPress={onHome} title="Back to the home page (Ctrl + H)">
            ← Home
          </Button>
        </header>
        <div className={`${HOME_BODY} flex flex-col items-center gap-4 text-center`}>
          <img
            src="../images/Dragging.gif"
            alt=""
            className="max-h-[22vh] max-w-[60vw] opacity-80"
          />
          <h1 className="text-2xl font-black tracking-tight">Drop a video and its subtitles anywhere</h1>
          {/* A div, not a p: Key renders a div, which a p cannot hold. */}
          <div className="max-w-md text-sm font-medium leading-8 text-blue-800">
            Subtitles named like the video load with it. You can also paste a YouTube link
            with <Key value="Ctrl + V" extraClass="inline-block align-middle leading-none"/>.
          </div>
          <Button type="primary" onPress={onOpenFiles} className="px-6">
            Open video or subtitles…
          </Button>
        </div>
      </section>

      {dailyWords.length > 0 && (
        <section className={`${HOME_SECTION} w-full max-w-4xl`}>
          <div className={HOME_SECTION_LABEL}>Words to review</div>
          <div className="grid grid-cols-2 gap-3 bg-white p-4 sm:grid-cols-3 lg:grid-cols-4">
            {dailyWords.map((item, index) => (
              <button
                type="button"
                key={`${item.word}-${index}`}
                className="rounded-xl border border-blue-200 p-4 text-center transition-transform duration-150 hover:-translate-y-0.5 hover:border-blue-400"
                style={{
                  background: `linear-gradient(135deg, ${getColorGradient(item.updTime)}, white)`
                }}
                onClick={() => handleWordClick(item.word)}
              >
                <div className="mb-1 break-words text-2xl font-bold text-blue-950">{item.word}</div>
                <div className="text-xs text-blue-700">Learned {getRelativeTime(item.updTime)}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default WordOfTheDay;
