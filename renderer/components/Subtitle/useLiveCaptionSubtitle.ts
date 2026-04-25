import {useEffect, useState} from "react";
import {Line, SubtitleContainer} from "./DataStructures";
import {fillLineWithLearningContent, isLearningSubtitleLanguage, TokenizeMiteiru} from "./subtitleLanguageSupport";

const liveCaptionStartTime = 0;
const liveCaptionEndTime = 1000000;

const buildLiveCaptionSubtitle = async (
  caption: string,
  lang: string,
  tokenizeMiteiru: TokenizeMiteiru
) => {
  const subtitle = new SubtitleContainer("", lang);
  const line = new Line(liveCaptionStartTime, liveCaptionEndTime, caption);

  if (isLearningSubtitleLanguage(lang)) {
    await fillLineWithLearningContent(line, lang, tokenizeMiteiru, subtitle.frequency);
  }

  subtitle.lines.push(line);
  return subtitle;
};

export const useLiveCaptionSubtitle = (
  caption: string,
  lang: string,
  tokenizeMiteiru: TokenizeMiteiru
) => {
  const [liveSubtitle, setLiveSubtitle] = useState(() => new SubtitleContainer(""));
  const [liveTimeCache, setLiveTimeCache] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!caption) {
      setLiveSubtitle(new SubtitleContainer(""));
      setLiveTimeCache([]);
      return () => {
        cancelled = true;
      };
    }

    buildLiveCaptionSubtitle(caption, lang, tokenizeMiteiru)
    .then((subtitle) => {
      if (cancelled) return;
      setLiveSubtitle(subtitle);
      setLiveTimeCache([]);
    })
    .catch((error) => {
      console.error("[LiveCaptionOverlay] Failed to process live caption:", error);
      if (cancelled) return;
      setLiveSubtitle(new SubtitleContainer(caption, lang));
      setLiveTimeCache([]);
    });

    return () => {
      cancelled = true;
    };
  }, [caption, lang, tokenizeMiteiru]);

  return {
    liveSubtitle,
    liveTimeCache,
    setLiveTimeCache
  };
};
