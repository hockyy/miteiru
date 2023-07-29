import React, {useEffect, useState} from "react";
import {ipcRenderer} from "electron";
import {KanjiSentence, Sentence} from "./Sentence";
import {CJKStyling, defaultMeaningBoxStyling} from "../utils/CJKStyling";
import {joinString} from "../utils/utils";
import {AwesomeButton} from "react-awesome-button";

const initialContentState = {sense: [], kanji: []};

const MeaningBox = ({
                      meaning,
                      setMeaning,
                      tokenizeMiteiru,
                      subtitleStyling = defaultMeaningBoxStyling
                    }: { meaning: string, setMeaning: any, tokenizeMiteiru: (value: string) => Promise<any[]>, subtitleStyling?: CJKStyling }) => {
  const [meaningContent, setMeaningContent] = useState(initialContentState)
  const [otherMeanings, setOtherMeanings] = useState([]);
  const [meaningIndex, setMeaningIndex] = useState(0);
  const [tags, setTags] = useState({})
  useEffect(() => {
    if (meaning === '') {
      setMeaningContent(initialContentState);
      return;
    }
    ipcRenderer.invoke('query', meaning, 5).then(val => {
      if (val.length === 0) {
        val.push({
          id: "0",
          kanji: [{
            text: meaning
          }],
          sense: []
        })
      }
      setOtherMeanings(val)
      setMeaningContent(val[0])
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
          {
            meaningContent.sense.map((sense, idxSense) => {

              return <div
                  className={"bg-white rounded-lg flex flex-col gap-2 border-2 border-blue-700 m-4 hovery"}
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
            })
          }
        </div>
      </div>
    </div>)
  } else {
    return (<></>);
  }
}

export default MeaningBox;