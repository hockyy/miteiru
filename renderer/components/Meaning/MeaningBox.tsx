import React, {useCallback, useEffect, useMemo, useState} from "react";
import {HanziSentence, KanjiSentence} from "../Subtitle/Sentence";
import {defaultLearningColorStyling, defaultMeaningBoxStyling} from "../../utils/CJKStyling";
import {joinString} from "../../utils/utils";
import {AwesomeButton} from "react-awesome-button";
import {isKanji, toHiragana} from 'wanakana'
import KanjiVGDisplay from "./KanjiVGDisplay";
import WanikaniRadicalDisplay from "./WanikaniRadicalDisplay";
import {videoConstants} from "../../utils/constants";
import MakeMeAHanziDisplay from "./MakeMeAHanziDisplay";
import {FaStar, FaVolumeUp} from 'react-icons/fa';
import useSpeech from "../../hooks/useSpeech";
import {useStoreData} from "../../hooks/useStoreData";

const OutlinedStar = ({
                        color,
                        size,
                        outlineColor = 'black',
                        outlineWidth = 1
                      }) => {
  const id = `star-outline-${color.replace('#', '')}`;

  return (
      <svg width={size} height={size}>
        <defs>
          <filter id={id}>
            <feMorphology in="SourceAlpha" result="expanded" operator="dilate"
                          radius={outlineWidth}/>
            <feFlood floodColor={outlineColor}/>
            <feComposite in2="expanded" operator="in"/>
            <feComposite in="SourceGraphic"/>
          </filter>
        </defs>
        <g filter={`url(#${id})`}>
          <FaStar color={color} size={size}/>
        </g>
      </svg>
  );
};


const initialContentState = {
  id: "",
  sense: [],
  single: [],
  content: '',
  simplified: ''
};
const initialCharacterContentState = {literal: null};

const getStarColor = (learningState) => {
  return defaultLearningColorStyling.learningColor[learningState].color;
};

const MeaningBox = ({
                      meaning,
                      setMeaning,
                      tokenizeMiteiru,
                      subtitleStyling = defaultMeaningBoxStyling,
                      customComponent = null,
                      lang,
                      changeLearningState = null,
                      getLearningState = null,
                      showMeaning = true,
                    }) => {
  const [meaningContent, setMeaningContent] = useState(initialContentState);
  const [meaningCharacter, setMeaningCharacter] = useState(initialCharacterContentState);
  const [otherMeanings, setOtherMeanings] = useState([]);
  const [meaningIndex, setMeaningIndex] = useState(0);
  const [tags, setTags] = useState({});
  const [romajiedData, setRomajiedData] = useState([]);

  const {
    speak,
    stop,
    speaking,
    supported
  } = useSpeech();
  const [selectedVoice,] = useStoreData('tts.option.voice', '');
  const handleSpeak = useCallback(() => {
    if (speaking) {
      stop();
    } else {
      speak(meaning, {
        lang,
        voice: selectedVoice
      });
    }
  }, [speaking, stop, speak, meaning, lang, selectedVoice]);


  const renderSpeakButton = useCallback(() => (
      <div className={'mr-4'}>
        <AwesomeButton
            onPress={handleSpeak}
            disabled={!supported}
        >
          {speaking ? 'Stop' : <FaVolumeUp/>}
        </AwesomeButton></div>
  ), [handleSpeak, speaking, supported]);

  const handleStarClick = useCallback(() => {
    changeLearningState(meaning);
  }, [changeLearningState, meaning]);

  const handleBGClick = useCallback(() => setMeaning(''), [setMeaning]);

  const handlePrevious = useCallback(() => {
    if (meaningIndex > 0) {
      setMeaningIndex(old => {
        setMeaningContent(otherMeanings[old - 1]);
        return old - 1;
      });
    }
  }, [meaningIndex, otherMeanings]);

  const handleNext = useCallback(() => {
    if (meaningIndex < otherMeanings.length - 1) {
      setMeaningIndex(old => {
        setMeaningContent(otherMeanings[old + 1]);
        return old + 1;
      });
    }
  }, [meaningIndex, otherMeanings]);

  useEffect(() => {
    const fetchCharacterData = async () => {
      if (meaning.length === 1) {
        if (lang === videoConstants.japaneseLang && isKanji(meaning)) {
          const result = await window.ipc.invoke("queryKanji", meaning);
          const waniResult = await window.ipc.invoke("getWaniKanji", meaning);
          setMeaningCharacter({
            ...result,
            wanikani: waniResult
          });
        } else if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
          const result = await window.ipc.invoke("queryHanzi", meaning);
          const waniResult = await window.ipc.invoke("getWaniKanji", meaning);
          setMeaningCharacter({
            ...result,
            literal: meaning[0],
            wanikani: waniResult
          });
        }
      } else {
        setMeaningCharacter(initialCharacterContentState);
      }
    };

    const fetchMeaningData = async () => {
      let entries = [];
      if (lang === videoConstants.japaneseLang) {
        entries = await window.ipc.invoke('queryJapanese', meaning, 5);
        entries.forEach(entry => {
          entry.single = entry.kanji.length ? entry.kanji : [{text: meaning}];
        });
        setTags(await window.ipc.invoke('japaneseTags'));
      } else if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
        entries = await window.ipc.invoke('queryChinese', meaning, 5);
        entries.forEach(entry => {
          entry.single = entry.content.split('，').map(text => ({text}));
        });
      }
      if (entries.length === 0) {
        if (lang === videoConstants.japaneseLang) {
          entries.push({
            id: "0",
            single: [{text: meaning}],
            sense: []
          });
        } else {
          entries.push({
            id: "0",
            content: meaning,
            simplified: meaning,
            pinyin: [],
            jyutping: [],
            meaning: [],
            single: [{text: meaning}]
          })
        }
      }

      setOtherMeanings(entries);
      setMeaningContent(entries[0]);
      setMeaningIndex(0);
    };

    if (meaning === '') {
      setMeaningContent(initialContentState);
      setMeaningCharacter(initialCharacterContentState);
    } else {
      fetchCharacterData();
      fetchMeaningData();
    }
  }, [lang, meaning, showMeaning]);

  useEffect(() => {
    const fetchRomajiedData = async () => {
      if (lang === videoConstants.japaneseLang) {
        const data = await Promise.all(
            meaningContent.single.map(async (val) => ({
              key: val.key,
              romajied: await tokenizeMiteiru(val.text)
            }))
        );
        setRomajiedData(data);
      } else if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
        const usedData = (meaningContent && meaningContent.simplified && meaningContent.simplified.includes(meaning)) ? meaningContent.simplified : meaningContent.content;
        const data = [{
          key: 0,
          romajied: (await tokenizeMiteiru(usedData))
        }];
        setRomajiedData(data);
      }
    };

    if (meaningContent.single.length) fetchRomajiedData();
  }, [lang, meaning, meaningContent, tokenizeMiteiru]);

  const renderRomajiedContent = useCallback(() => (
      romajiedData.map(({
                          key,
                          romajied
                        }) => (
          <RomajiedContent
              key={key}
              romajied={romajied}
              lang={lang}
              setMeaning={setMeaning}
              subtitleStyling={subtitleStyling}
          />
      ))
  ), [romajiedData, lang, setMeaning, subtitleStyling]);

  const renderStarButton = useCallback(() => (
      getLearningState && changeLearningState && (
          <button onClick={handleStarClick} className="ml-4">
            <OutlinedStar
                color={getStarColor(getLearningState(meaning))}
                size={24}
                outlineColor="black"
                outlineWidth={1}
            />
          </button>
      )
  ), [getLearningState, changeLearningState, handleStarClick, meaning]);

  const memoizedCustomComponent = useMemo(() => customComponent, [customComponent]);

  const memoizedCharacterContent = useMemo(() => {
    if (!showMeaning) return <></>
    return (
        <CharacterContent
            lang={lang}
            meaningCharacter={meaningCharacter}
            setMeaning={setMeaning}
            subtitleStyling={subtitleStyling}
        />
    );
  }, [lang, meaningCharacter, setMeaning, showMeaning, subtitleStyling]);

  const memoizedMeaningContent = useMemo(() => {
    if (!showMeaning) return <></>
    return (
        <MeaningContent meaningContent={meaningContent} lang={lang} tags={tags}/>
    );
  }, [showMeaning, meaningContent, lang, tags]);

  if (meaningContent.single.length === 0) return null;

  return (
      <div onClick={handleBGClick} className="z-[18] fixed bg-blue-200/20 w-[100vw] h-[100vh]">
        <div
            onClick={(e) => e.stopPropagation()}
            className="overflow-auto border-2 border-blue-700 inset-x-0 mx-auto mt-10 bg-blue-100 z-[101] fixed rounded-lg w-[80vw] h-[80vh]"
        >
          <div className={'flex flex-col'}>
            {memoizedCustomComponent}
            <div
                className="z-[100] sticky top-0 h-auto flex flex-row justify-between gap-3 items-center bg-white p-5 rounded-t-lg">
              <AwesomeButton type="primary" disabled={meaningIndex === 0} onPress={handlePrevious}>
                Previous
              </AwesomeButton>
              <div className="flex flex-wrap gap-5 items-center" style={{
                fontFamily: "Arial",
                fontSize: "40px"
              }}>
                {renderSpeakButton()}
                {renderRomajiedContent()}
                {renderStarButton()}
              </div>
              <AwesomeButton type="primary" disabled={meaningIndex === otherMeanings.length - 1}
                             onPress={handleNext}>
                Next
              </AwesomeButton>
            </div>
          </div>
          <div className="rounded-b-lg text-blue-800 text-lg p-2">
            {memoizedCharacterContent}
            {memoizedMeaningContent}
          </div>
        </div>
      </div>
  );
};

const ExternalLinkComponent = ({
                                 lang,
                                 queryText
                               }) => {
  if (lang === videoConstants.japaneseLang) {
    return <ExternalLink style={{color: "black"}} urlBase="https://jisho.org/search/"
                         displayText="Jisho" query={queryText}/>;
  }
  if (lang === videoConstants.cantoneseLang) {
    return <ExternalLink style={{color: "black"}} urlBase="https://cantonese.org/search.php?q="
                         displayText="Cantonese.org" query={queryText}/>;
  }
  return null;
};

const CharacterContent = ({
                            lang,
                            meaningCharacter,
                            setMeaning,
                            subtitleStyling
                          }) => {
  if (!meaningCharacter.literal) return null;

  if (lang === videoConstants.japaneseLang) {
    return kanjiBoxEntry(meaningCharacter);
  }
  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    return <HanziBoxEntry meaningHanzi={meaningCharacter} setMeaning={setMeaning}
                          subtitleStyling={subtitleStyling}/>;
  }
  return null;
};

const MeaningContent = ({
                          meaningContent,
                          lang,
                          tags
                        }) => {
  if (meaningContent.sense) {
    return meaningContent.sense.map((sense, idxSense) => meaningBoxEntry(sense, idxSense, tags));
  }
  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    return meaningBoxEntryChinese(meaningContent);
  }
  return null;
};

const RomajiedContent = ({
                           romajied,
                           lang,
                           setMeaning,
                           subtitleStyling
                         }) => {
  const queryText = romajied.reduce((acc, next) => acc + next.origin, "");
  return (
      <div className="flex flex-col justify-between items-center gap-2">
        <div
            className="bg-white gap-0 rounded-xl p-2 border-2 border-blue-700 w-fit unselectable hovery">
          {lang === videoConstants.japaneseLang && romajied.map((val, idx) => (
              <KanjiSentence key={idx} origin={val.origin} setMeaning={setMeaning}
                             separation={val.separation}
                             extraClass="unselectable meaning-kanji text-md"
                             subtitleStyling={subtitleStyling}/>
          ))}
          {(lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang) && romajied.map((val, idx) => {
            return (

                <HanziSentence key={idx} origin={val.origin}
                               pinyin={(lang === videoConstants.chineseLang ? val.pinyin : val.jyutping).split(' ')}
                               setMeaning={setMeaning}
                               extraClass="unselectable meaning-kanji text-md"
                               subtitleStyling={subtitleStyling}/>
            );
          })}
        </div>
        <ExternalLinkComponent lang={lang} queryText={queryText}/>
      </div>
  );
};

const entryClasses = "bg-white rounded-lg flex flex-col gap-2 border-2 m-4 hovery "


const WaniKaniComponent = ({slug}) => {
  const handleClick = (event) => {
    event.preventDefault();
    window.electronAPI.openExternal(`https://www.wanikani.com/radicals/${slug}`);
  };


  const [radicalDisplay, setRadicalDisplay] = useState('');
  const [radicalName, setRadicalName] = useState('');
  useEffect(() => {
    window.ipc.invoke("getWaniRadical", slug)
    .then(radical => {
      setRadicalDisplay(radical.character);
      setRadicalName(radical.meaning);
    });
  }, [slug])

  return (
      <div
          className={"flex flex-col p-1 pb-3 items-center justify-center text-center radical-bubble"}
          onClick={handleClick}>
        {radicalName}
        <WanikaniRadicalDisplay slug={slug} characters={radicalDisplay}/>
      </div>
  );
};

const MeaningMnemonics = ({content}) => {
  const parseContent = () => {
    const regex = /<(\w+)>(.*?)<\/\1>/g;
    const parts = [];

    let lastIndex = 0;

    let match;
    while ((match = regex.exec(content))) {
      const [fullMatch, tag, innerContent] = match;
      const {index} = match;

      parts.push(content.slice(lastIndex, index));

      // Add tagged content
      if (tag === 'radical') {
        parts.push(<span key={index}
                         style={{
                           fontWeight: 'bold',
                           color: '#3B82F6'
                         }}>{innerContent}</span>);
      } else if (tag === 'kanji') {
        parts.push(<span key={index}
                         style={{
                           fontWeight: 'bold',
                           color: '#000000'
                         }}>{innerContent}</span>);
      }

      lastIndex = index + fullMatch.length;
    }

    parts.push(content.slice(lastIndex));
    return parts;
  };

  return <div className="m-2">{parseContent()}</div>;
};

const kanjiBoxEntry = (meaningKanji) => {
  const jlpt = meaningKanji.misc.jlptLevel;
  const grade = meaningKanji.misc.grade;
  const frequency = meaningKanji.misc.frequency;
  const ucs = meaningKanji.codepoints.filter(val => val.type === 'ucs').map(val => val.value);
  const bubbleBox = [
    `${meaningKanji.literal}`,
    jlpt ? `JLPT N${jlpt}` : null,
    grade ? `Grade ${grade}` : null,
    frequency ? `Top ${meaningKanji.misc.frequency} kanji` : null,
    `${meaningKanji.misc.strokeCounts[0]} writing strokes`].filter(val => !!val)

  const groups = meaningKanji.readingMeaning.groups.map(member => {
    const onyomi = member.readings.filter(val => val.type === 'ja_on').map(val => {
      return val.value + `『${toHiragana(val.value)}』`
    })
    const kunyomi = member.readings.filter(val => val.type === 'ja_kun').map(val => val.value)
    const meanings = member.meanings.filter(val => val.lang === 'en').map(val => val.value)
    const urls = [
      <ExternalLink key={'jisho'} urlBase="https://jisho.org/search/" displayText="Jisho"
                    query={meaningKanji.literal}/>,
      <ExternalLink key={'wanikani'} urlBase="https://www.wanikani.com/kanji/"
                    displayText="Wanikani"
                    query={meaningKanji.literal}/>,
      <ExternalLink key={'tangorin'} urlBase="https://tangorin.com/kanji/" displayText="Tangorin"
                    query={meaningKanji.literal}/>,
      <ExternalLink key={'koohii'} urlBase="https://kanji.koohii.com/study/kanji/"
                    displayText="Koohii"
                    query={meaningKanji.literal}/>
    ];
    return {
      meanings,
      "音読み (Onyomi)": onyomi,
      "訓読み (Kunyomi)": kunyomi,
      urls,
      "Wanikani": meaningKanji.wanikani ? meaningKanji.wanikani.component_subject_ids.map(radicalName =>
          <WaniKaniComponent key={radicalName} slug={radicalName}/>) : [],

      "Mnemonics": meaningKanji.wanikani ?
          [<MeaningMnemonics key={'mnemonic'}
                             content={meaningKanji.wanikani.meaning_mnemonic}/>] : [],
    }
  })
  const containerClassName = "flex flex-row gap-2 text-red-600 text-xl"
  const headerClassName = "flex flex-row gap-2 font-bold capitalize"
  // const onyomi = meaningKanji.readingMeaning.groups[0].readings.filter(val => val.type === 'ja_on')
  return <div
      className={entryClasses + " border-red-700"}
      key={"kanji-entry"}>

    <div className={"flex flex-wrap container rounded-t-lg bg-red-100 px-1"}>
      {bubbleBox.map((val, index) => {
        return <div
            key={index}
            className={"unselectable bg-red-600 w-fit p-1 rounded-lg px-2 ml-3 my-3 text-white"}>
          {val}
        </div>
      })}
    </div>
    <div className={'flex flex-row'}>

      {ucs.length > 0 && <KanjiVGDisplay filename={`0${ucs[0]}.svg`}/>}
      {groups.map((val, index) => {
        return <div key={index} className={'flex flex-col gap-2 m-3'}>
          {Object.entries(val).map(([key, value], index) => {
            return <div key={index} className={containerClassName}>
              <div className={headerClassName}>{key}:</div>
              {bubbleEntryReading(value)}
            </div>
          })}
          <hr/>
        </div>
      })}
    </div>
  </div>
}

const HanziBoxEntry = ({
                         meaningHanzi,
                         setMeaning,
                         subtitleStyling
                       }) => {
  const bubbleBox = [
    `CantoDict ${meaningHanzi.cantodict_id}`,
    meaningHanzi.dialect ? `${meaningHanzi.dialect} dialect` : '',
    meaningHanzi.stroke_count ? `${meaningHanzi.stroke_count} strokes` : '',
    meaningHanzi.freq ? `${meaningHanzi.freq} appearances` : '',
  ].filter(val => !!val);

  const bubbleExplanation = useMemo(() => {
    const urls = [
      <ExternalLink key={'cantonese'} urlBase="https://cantonese.org/search.php?q="
                    displayText="Cantonese.org"
                    query={meaningHanzi.literal}/>,
    ];
    const pinyin = meaningHanzi.pinyin
    const decomposition = meaningHanzi.decomposition ? Array.from(meaningHanzi.decomposition) : [];
    const radical = meaningHanzi.radical ? Array.from(meaningHanzi.radical) : [];
    const jyutping = meaningHanzi.jyutping;
    const etymology = meaningHanzi.etymology && meaningHanzi.etymology.type ? [`${meaningHanzi.etymology.type} | ${meaningHanzi.etymology.hint}`] : [];
    const notes = meaningHanzi.notes;
    const variants = meaningHanzi.variants;
    const similar = meaningHanzi.similar;
    const wanikaniRadicals = meaningHanzi.wanikani ? meaningHanzi.wanikani.component_subject_ids.map(radicalName =>
        <WaniKaniComponent key={radicalName} slug={radicalName}/>) : [];
    const wanikaniMnemonics = meaningHanzi.wanikani ?
        [<MeaningMnemonics key={'mnemonic'}
                           content={meaningHanzi.wanikani.meaning_mnemonic}/>] : [];
    return {
      urls,
      pinyin,
      decomposition,
      radical,
      jyutping,
      etymology,
      notes,
      variants,
      similar,
      "Wanikani Radicals": wanikaniRadicals,
      "Wanikani Mnemonics": wanikaniMnemonics
    }
  }, [meaningHanzi.decomposition, meaningHanzi.etymology, meaningHanzi.jyutping, meaningHanzi.literal, meaningHanzi.notes, meaningHanzi.pinyin, meaningHanzi.radical, meaningHanzi.similar, meaningHanzi.variants, meaningHanzi.wanikani]);
  const containerClassName = "flex flex-row gap-2 text-red-600 text-xl"
  const headerClassName = "flex flex-row gap-2 font-bold capitalize"
  return <div
      className={entryClasses + " border-red-700"}
      key={"kanji-entry"}>

    <div className={"flex flex-wrap container rounded-t-lg bg-red-100 px-1"}>
      {bubbleBox.map((val, index) => {
        return <div
            key={index}
            className={"unselectable bg-red-600 w-fit p-1 rounded-lg px-2 ml-3 my-3 text-white"}>
          {val}
        </div>
      })}
    </div>
    <div className={'flex flex-row'}>
      <MakeMeAHanziDisplay character={meaningHanzi.literal}/>
      <div className={'flex flex-col gap-2 m-3'}>
        <div className={'text-5xl flex flex-row gap-5'}>

          {meaningHanzi.decomposition && Array.from(meaningHanzi.decomposition).map((value: string, index) => {
            if (!value.match(videoConstants.cjkRegex)) return;
            return <div
                key={index + 'div'}
                className={"bg-white gap-0 rounded-xl p-2 border-2 border-blue-700 w-fit unselectable hovery"}>
              <HanziSentence key={index}
                             origin={value}
                             setMeaning={setMeaning}
                             extraClass={"unselectable meaning-kanji text-md"}
                             subtitleStyling={subtitleStyling}/>
            </div>
          })}
        </div>
        <div className={"flex flex-col"}>
          {(meaningHanzi.meaning ? meaningHanzi.meaning : []).map((val, idx) => {
            return <div key={idx} className={'text-red-600 mb-1'}>
              < span className={"font-bold mr-1"}>{idx + 1}.</span>
              {
                val
              }
            </div>
          })}
        </div>
        {Object.entries(bubbleExplanation).map(([key, value], index) => {
          if (!value || value.filter(val => (!!val)).length === 0) return;
          return <div key={index} className={containerClassName}>
            <div className={headerClassName}>{key}:</div>
            {bubbleEntryReading(value)}
          </div>
        })}
        <hr/>
      </div>
    </div>
  </div>
}


const bubbleEntryReading = (readings, extraClass = 'bg-red-100') => {
  return <div className={"flex flex-wrap gap-3"}>
    {readings && readings.map((val, index) => {
      if (!val) return;
      return <div key={`bubble-${index}`} className={'rounded-md px-2 ' + extraClass}>{val}</div>
    })}
  </div>
}

const meaningBoxEntry = (sense, idxSense, tags) => {
  return <div
      className={entryClasses + "border-blue-700"}
      key={idxSense}>
    <div
        className={"flex flex-wrap container rounded-t-lg bg-blue-200 px-3"}>{

      sense.partOfSpeech.map((val, keyTags) => {
            let ret = val;
            try {
              ret = tags[val];
            } catch (e) {
            }
            return <div
                key={keyTags}
                className={"bg-blue-500 w-fit p-1 rounded-lg px-2 m-3 text-white"}>{ret}</div>
          }
      )}</div>
    <div className={"flex flex-row px-3"}>
      <div className={'mx-2 mb-3'}>
        <span className={"font-bold text-blue-8 mr-1"}>{idxSense + 1}.</span>
        {
          joinString(sense.gloss.map((gloss) => {
            return gloss.text
          }))
        }
      </div>
    </div>
  </div>
}

const meaningBoxEntryChinese = (meaningContent) => {
  const info = {
    'Simplified': meaningContent.simplified,
    // 'Pinyin': meaningContent.pinyin,
    'Jyutping': meaningContent.jyutping,
    '$comments': meaningContent.comments,
  };
  return <div
      className={entryClasses + "border-blue-700"}>
    <div
        className={"flex flex-wrap container rounded-t-lg bg-blue-200 px-3"}>
      {Object.entries(info).map((val) => {
            return !val[1] ? <></> : (<div
                className={"bg-blue-500 w-fit p-1 rounded-lg px-2 m-3 text-white"}>
              {!val[0].startsWith('$') && <strong>{val[0]}:</strong>} {val[1]}
            </div>);
          }
      )}
    </div>
    <div className={"flex flex-row px-3"}>
      <div className={'mx-2 mb-3'}>
        <span className={"font-bold text-blue-8 mr-1"}>{1}.</span>
        {
          joinString(meaningContent.meaning)
        }
      </div>
    </div>
  </div>
}

const ExternalLink = ({
                        urlBase,
                        displayText,
                        query,
                        style = {}
                      }) => {
  const handleClick = (event) => {
    event.preventDefault();
    window.electronAPI.openExternal(`${urlBase}${query}`);
  };

  return (
      <a style={style} className={"url-bubble"} onClick={handleClick}>
        {displayText}
      </a>
  );
};


export default MeaningBox;