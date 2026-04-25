import React, {useEffect, useState} from "react";
import {CJKStyling} from "../../utils/CJKStyling";
import {videoConstants} from "../../utils/constants";
import {Line, SubtitleContainer} from "./DataStructures";
import {PrimarySubtitle} from "./Subtitle";

interface LiveCaptionOverlayProps {
  caption: string;
  subtitleStyling: CJKStyling;
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<any[]>;
  setMeaning: (newMeaning: string) => void;
  getLearningStateClass?: (newMeaning: string) => string;
  changeLearningState?: (newMeaning: string) => void;
  setExternalContent?: (content: any[]) => void;
  setRubyCopyContent: any;
}

export const LiveCaptionOverlay = ({
  caption,
  subtitleStyling,
  lang,
  tokenizeMiteiru,
  setMeaning,
  getLearningStateClass,
  changeLearningState,
  setExternalContent,
  setRubyCopyContent
}: LiveCaptionOverlayProps) => {
  const displayText = caption;
  const [liveSubtitle, setLiveSubtitle] = useState(() => new SubtitleContainer(""));
  const [liveTimeCache, setLiveTimeCache] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    const processCaption = async () => {
      if (!displayText) {
        setLiveSubtitle(new SubtitleContainer(""));
        setLiveTimeCache([]);
        return;
      }

      const subtitle = new SubtitleContainer("", lang);
      const line = new Line(0, 1000000, displayText);

      if (![
        videoConstants.japaneseLang,
        videoConstants.chineseLang,
        videoConstants.cantoneseLang,
        videoConstants.vietnameseLang
      ].includes(lang)) {
        subtitle.lines.push(line);
      } else {
        await line.fillContentSeparations(tokenizeMiteiru);

        const frequency = new Map<string, number>();
        if (lang === videoConstants.japaneseLang) {
          await line.fillContentWithLearningKotoba(frequency);
        } else if (lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang) {
          await line.fillContentWithLearningChinese(frequency);
        } else if (lang === videoConstants.vietnameseLang) {
          await line.fillContentWithLearningVietnamese(frequency);
        }

        subtitle.lines.push(line);
      }

      if (cancelled) return;
      setLiveSubtitle(subtitle);
      setLiveTimeCache([]);
    };

    processCaption().catch((error) => {
      console.error("[LiveCaptionOverlay] Failed to process live caption:", error);
      if (cancelled) return;
      setLiveSubtitle(new SubtitleContainer(displayText, lang));
      setLiveTimeCache([]);
    });

    return () => {
      cancelled = true;
    };
  }, [displayText, lang, tokenizeMiteiru]);

  if (!displayText || liveSubtitle.lines.length === 0) return null;

  return (
    <PrimarySubtitle
      currentTime={0}
      subtitle={liveSubtitle}
      shift={0}
      setMeaning={setMeaning}
      subtitleStyling={subtitleStyling}
      getLearningStateClass={getLearningStateClass}
      changeLearningState={changeLearningState}
      timeCache={liveTimeCache}
      setTimeCache={setLiveTimeCache}
      setExternalContent={setExternalContent}
      setRubyCopyContent={setRubyCopyContent}
    />
  );
};
