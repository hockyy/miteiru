import {useEffect, useState} from "react";
import {videoConstants} from "../../utils/constants";
import {Line, SubtitleContainer} from "./DataStructures";

const liveCaptionStartTime = 0;
const liveCaptionEndTime = 1000000;

const languagesWithLearningContent = new Set([
  videoConstants.japaneseLang,
  videoConstants.chineseLang,
  videoConstants.cantoneseLang,
  videoConstants.vietnameseLang
]);

const fillLearningContent = async (line: Line, lang: string) => {
  const frequency = new Map<string, number>();

  if (lang === videoConstants.japaneseLang) {
    await line.fillContentWithLearningKotoba(frequency);
    return;
  }

  if (lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang) {
    await line.fillContentWithLearningChinese(frequency);
    return;
  }

  if (lang === videoConstants.vietnameseLang) {
    await line.fillContentWithLearningVietnamese(frequency);
  }
};

const buildLiveCaptionSubtitle = async (
  caption: string,
  lang: string,
  tokenizeMiteiru: (text: string) => Promise<any[]>
) => {
  const subtitle = new SubtitleContainer("", lang);
  const line = new Line(liveCaptionStartTime, liveCaptionEndTime, caption);

  if (languagesWithLearningContent.has(lang)) {
    await line.fillContentSeparations(tokenizeMiteiru);
    await fillLearningContent(line, lang);
  }

  subtitle.lines.push(line);
  return subtitle;
};

export const useLiveCaptionSubtitle = (
  caption: string,
  lang: string,
  tokenizeMiteiru: (text: string) => Promise<any[]>
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
