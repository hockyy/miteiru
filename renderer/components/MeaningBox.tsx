import React, {useEffect, useState} from "react";
import {ipcRenderer} from "electron";
import {KanjiSentence} from "./Sentence";
import {CJKStyling, defaultMeaningBoxStyling} from "../utils/CJKStyling";
import {joinString} from "../utils/utils";
import {AwesomeButton} from "react-awesome-button";
import {isKanji, toHiragana} from 'wanakana'

const initialContentState = {sense: [], kanji: []};
const initialKanjiContentState = {literal: null};

const MeaningBox = ({
                      meaning,
                      setMeaning,
                      tokenizeMiteiru,
                      subtitleStyling = defaultMeaningBoxStyling
                    }: { meaning: string, setMeaning: any, tokenizeMiteiru: (value: string) => Promise<any[]>, subtitleStyling?: CJKStyling }) => {
  const [meaningContent, setMeaningContent] = useState(initialContentState)
  const [meaningKanji, setMeaningKanji] = useState(initialKanjiContentState)
  const [otherMeanings, setOtherMeanings] = useState([]);
  const [meaningIndex, setMeaningIndex] = useState(0);
  const [tags, setTags] = useState({})
  useEffect(() => {
    if (meaning === '') {
      setMeaningContent(initialContentState);
      setMeaningKanji(initialKanjiContentState);
      return;
    }
    if (meaning.length === 1 && isKanji(meaning)) {
      ipcRenderer.invoke("queryKanji", meaning).then(result => {
        console.log(result)
        setMeaningKanji(result);
      })
    } else {
      setMeaningKanji(initialKanjiContentState);
    }
    ipcRenderer.invoke('query', meaning, 5).then(entries => {
      for (const entry of entries) {
        if (entry.kanji.length === 0) {
          entry.kanji.push({
            text: meaning
          })
        }
      }
      if (entries.length === 0) {
        entries.push({
          id: "0",
          kanji: [{
            text: meaning
          }],
          sense: []
        })
      }
      setOtherMeanings(entries)
      setMeaningContent(entries[0])
      setMeaningIndex(0)
    })
    ipcRenderer.invoke('tags').then(val => {
      setTags(val)
    })
  }, [meaning]);


  const [furiganizedData, setFuriganizedData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const data = await Promise.all(meaningContent.kanji.map(async (val) => {
        const furiganized = await tokenizeMiteiru(val.text);
        return {
          key: val.key,
          furiganized
        };
      }));

      setFuriganizedData(data);
    };
    if (meaningContent.kanji.length) fetchData();
  }, [meaningContent.kanji]); // Add your dependencies here


  if (meaningContent.kanji.length > 0) {
    return (<div onClick={() => {
      setMeaning('');
    }} className={"z-[18] fixed bg-blue-200/20 w-[100vw] h-[100vh]"}>
      <div
          onClick={(e) => {
            e.stopPropagation()
          }
          }
          className={"overflow-auto border-2 border-blue-700 inset-x-0 mx-auto mt-10 bg-blue-100 z-[101] fixed rounded-lg w-[80vw] h-[80vh]"}>
        <div
            className={"z-[100] sticky top-0 h-auto flex flex-row gap-3 justify-center items-center bg-white p-5 rounded-t-lg"}>

          {meaningIndex - 1 >= 0 &&
              < AwesomeButton type={"primary"} onPress={(e) => {
                e.stopPropagation()
                setMeaningIndex((old) => {
                  setMeaningContent(otherMeanings[old - 1])
                  return old - 1
                })
              }
              }>Previous
              </AwesomeButton>}
          <div className={"flex flex-wrap gap-2"} style={{
            fontFamily: "Arial",
            fontSize: "40px",
          }}>
            {furiganizedData.map(({key, furiganized}) => (
                <div key={key}
                     className={"bg-white rounded-xl p-2 border-2 border-blue-700 w-fit unselectable hovery"}>
                  {[...furiganized.map((val, idx) => (
                      <KanjiSentence key={idx}
                                     origin={val.origin}
                                     setMeaning={setMeaning}
                                     separation={val.separation}
                                     extraClass={"unselectable meaning-kanji text-md"}
                                     subtitleStyling={subtitleStyling}/>
                  ))]}
                </div>
            ))}
          </div>
          {meaningIndex + 1 < otherMeanings.length &&
              <AwesomeButton type={"primary"} onPress={(e) => {
                e.stopPropagation()
                setMeaningIndex((old) => {
                  setMeaningContent(otherMeanings[old + 1])
                  return old + 1
                })
              }
              }>Next
              </AwesomeButton>}
        </div>
        <div className={"rounded-b-lg text-blue-800 text-lg p-2"}>
          {meaningKanji.literal && [kanjiBoxEntry(meaningKanji)]}
          {
            meaningContent.sense.map((sense, idxSense) => {
              return meaningBoxEntry(sense, idxSense, tags)
            })
          }
        </div>
      </div>
    </div>)
  } else {
    return (<></>);
  }
}

const entryClasses = "bg-white rounded-lg flex flex-col gap-2 border-2 m-4 hovery "

const kanjiBoxEntry = (meaningKanji) => {
  const bubbleBox = [`${meaningKanji.literal}`, `JLPT N${meaningKanji.misc.jlptLevel}`,
    `Grade ${meaningKanji.misc.grade}`,
    `Top ${meaningKanji.misc.frequency} Kanji`,
    `${meaningKanji.misc.strokeCounts[0]} writing strokes`]
  const groups = meaningKanji.readingMeaning.groups.map(member => {
    const onyomi = member.readings.filter(val => val.type === 'ja_on').map(val => {
      return val.value + `『${toHiragana(val.value)}』`
    })
    const kunyomi = member.readings.filter(val => val.type === 'ja_kun').map(val => val.value)
    const meanings = member.meanings.filter(val => val.lang === 'en').map(val => val.value)
    return {
      meanings,
      "音読み (Onyomi)": onyomi,
      "訓読み (Kunyomi)": kunyomi,
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
    {groups.map((val, index) => {
      return <div key={index} className={'flex flex-col gap-2 m-3'}>
        {Object.entries(val).map(([key, value], index) => {
          return <div className={containerClassName}>
            <div className={headerClassName}>{key}:</div>
            {bubbleEntryReading(value)}
          </div>
        })}
        <hr/>
      </div>
    })}
  </div>
}

const bubbleEntryReading = (readings) => {
  return <div className={"flex flex-wrap gap-3"}>
    {readings.map((val, index) => {
      return <div key={`bubble-${index}`} className={`rounded-md px-2 bg-red-100`}>{val}</div>
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

export default MeaningBox;