// components/VideoPlayer/VocabSidebar.js
import React, {useState, useEffect, useCallback} from 'react';
import {ipcRenderer} from 'electron';
import {getColorGradient, getRelativeTime} from '../../utils/utils';
import {ArrowRight} from "./Icons";
import {AwesomeButton} from "react-awesome-button";

const VocabSidebar = ({showVocabSidebar, setShowVocabSidebar, lang, setMeaning}) => {
  const [sortedVocab, setSortedVocab] = useState([]);

  const loadVocabulary = useCallback(async () => {
    try {
      const loadedState = await ipcRenderer.invoke('loadLearningState', lang);
      const sorted = Object.entries(loadedState).sort((a: any[], b: any[]) => b[1].updTime - a[1].updTime);
      setSortedVocab(sorted);
    } catch (error) {
      console.error('Error loading vocabulary:', error);
    }
  }, [lang]);

  useEffect(() => {
    loadVocabulary();
  }, [lang, loadVocabulary]);

  const jumpToWord = useCallback((word) => {
    setMeaning(word);
  }, [setMeaning]);

  const saveVocabHandler = useCallback(() => {
    ipcRenderer.invoke('loadLearningState', lang).then((val) => {
      ipcRenderer.invoke("saveFile", ["json"], JSON.stringify(val))
    })
  }, [lang]);

  const loadVocabHandler = useCallback(() => {
    ipcRenderer.invoke("readFile", ["json"]).then((val) => {
      try {
        const parsed = JSON.parse(val);
        ipcRenderer.invoke("updateContentBatch", parsed, lang)
      } catch (e) {
        console.error(e)
      }
    })
  }, [lang]);

  return (
      <div
          style={{
            transition: "all 0.3s ease-out",
            transform: `translate(${showVocabSidebar ? "0" : "-30vw"}, 0`
          }}
          className={"overflow-y-scroll overflow-x-clip flex flex-col content-center items-center p-3 z-[19] fixed left-0 top-0 h-screen w-[30vw] bg-gray-700/70 text-white"}
      >
        <button className={"self-end p-2"} onClick={() => setShowVocabSidebar(old => !old)}>
          <div className={"animation h-5"}>
            {ArrowRight}
          </div>
        </button>
        <div className={"font-bold unselectable text-3xl m-4"}>
          Vocabulary List ({lang})
        </div>

        <div className={"w-full mx-5 px-3 flex flex-col content-start gap-3 unselectable"}>
          <div className={"flex flex-row gap-2 w-full"}>
            <AwesomeButton
                type={"primary"}
                className={"w-full"}
                onPress={saveVocabHandler}
            >
              Save Vocabulary
            </AwesomeButton>
            <AwesomeButton
                type={"secondary"}
                className={"w-full"}
                onPress={loadVocabHandler}
            >
              Load Vocabulary
            </AwesomeButton>
          </div>

          {sortedVocab.map((word) => (
              <div
                  key={word[0]}
                  className="cursor-pointer hover:bg-blue-200 p-2 rounded mb-2 flex justify-between items-center text-black"
                  onClick={() => jumpToWord(word[0])}
                  style={{backgroundColor: getColorGradient(word[1].updTime)}}
              >
                <span className="text-3xl">{word[0]}</span>
                <span className="text-gray-600">{getRelativeTime(word[1].updTime)}</span>
              </div>
          ))}
        </div>
      </div>
  );
};

export default VocabSidebar;