import React from 'react';
import {AwesomeButton} from 'react-awesome-button';
import {JapaneseSentence, ChineseSentence} from '../Subtitle/Sentence';
import {videoConstants} from '../../utils/constants';
import {defaultMeaningBoxStyling, defaultPrimarySubtitleStyling} from '../../utils/CJKStyling';
import { useStoreData } from '../../hooks/useStoreData';

interface ImageDisplayPopupProps {
  imageDataUrl: string | null;
  term: string;
  romajied: any[];
  lang: string;
  meaningText: string;
  onClose: () => void;
}

const noop = () => {};

export const ImageDisplayPopup: React.FC<ImageDisplayPopupProps> = ({
  imageDataUrl,
  term,
  romajied,
  lang,
  meaningText,
  onClose,
}) => {
  const [subtitleStyling] = useStoreData('user.styling.primary', defaultPrimarySubtitleStyling);

  const fontStyle = {
    fontFamily: subtitleStyling.text.fontFamily,
    fontWeight: subtitleStyling.text.weight,
    fontSize: subtitleStyling.text.fontSize,
    WebkitTextShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)',
    textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)',
    WebkitTextStroke: `${subtitleStyling.stroke.width} ${subtitleStyling.stroke.color}`,
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl max-w-6xl w-[90vw] bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 border-2 border-amber-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative corner flourishes */}
        <div className="absolute top-0 right-0 w-24 h-24 text-amber-300/50 text-6xl transform rotate-12">✦</div>
        <div className="absolute bottom-0 left-0 w-20 h-20 text-rose-300/50 text-5xl transform -rotate-12">❀</div>

        <div className="p-6 space-y-5">
          {/* Image with overlays */}
          {imageDataUrl && (
            <div
              className="relative rounded-xl overflow-hidden border-2 border-amber-200 shadow-lg bg-white"
              style={fontStyle}
            >
              <img
                src={imageDataUrl}
                alt={term}
                className="w-full h-auto max-h-[70vh] object-cover"
              />
              {/* Subtitle-style term display - overlay on top */}
              <div className="absolute inset-x-0 top-0 p-12 right-0" style={fontStyle}>
                <div className="flex justify-end min-h-[2.5rem] items-center" style={fontStyle}>
                  {romajied?.length > 0 ? (
                    (() => {
                      const origin = romajied.map((t) => t.origin).join('');
                      const separation = romajied.flatMap((t) =>
                        t.separation || [{
                          main: t.origin ?? t,
                          hiragana: t.hiragana ?? '',
                          jyutping: t.jyutping ?? '',
                          pinyin: t.pinyin ?? t.jyutping ?? '',
                        }]
                      );
                      const isChinese = lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang;
                      const isVietnamese = lang === videoConstants.vietnameseLang;
                      const isJapanese = lang === videoConstants.japaneseLang;

                      if (isJapanese) {
                        return (
                          <JapaneseSentence
                            origin={origin}
                            separation={separation}
                            setMeaning={noop}
                            extraClass=""
                            subtitleStyling={subtitleStyling}
                            wordMeaning=""
                          />
                        );
                      }
                      if (isChinese || isVietnamese) {
                        return (
                          <ChineseSentence
                            origin={origin}
                            separation={separation}
                            setMeaning={noop}
                            extraClass="text-8xl"
                            subtitleStyling={subtitleStyling}
                            wordMeaning=""
                          />
                        );
                      }
                      return <span className="text-white drop-shadow-md" style={fontStyle}>{term}</span>;
                    })()
                  ) : (
                    <span className="text-white drop-shadow-md" style={fontStyle}>{term}</span>
                  )}
                </div>
              </div>

              {/* Meaning - overlay on bottom of image */}
              {meaningText && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/30 to-transparent p-4 bg-black/30">
                  <div className="text-xs font-semibold text-rose-200 mb-2 tracking-wider uppercase" style={fontStyle}>Meaning</div>
                  <p className="text-white leading-relaxed drop-shadow-md" style={fontStyle}>{meaningText}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center pt-2">
            <AwesomeButton type="primary" size="small" onPress={onClose}>
              Close
            </AwesomeButton>
          </div>
        </div>
      </div>
    </div>
  );
};
