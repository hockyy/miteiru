import {useEffect, useState} from "react";
import {ipcRenderer} from "electron";

const initialContentState = {sense: [], kanji: []};

const MeaningBox = ({meaning}: { meaning: string }) => {
  const [meaningContent, setMeaningContent] = useState(initialContentState)
  useEffect(() => {
    console.log(meaning)
    if (meaning === '') return;
    ipcRenderer.invoke('query', meaning).then(val => {
      console.log(val)
      if (val.length > 0) {
        console.log(val[0])
        setMeaningContent(val[0])
      } else {
        setMeaningContent(initialContentState)
      }

    })
  }, [meaning]);
  const joinString = (arr, separator = '; ') => {
    let total = "";
    arr.forEach(val => {
      if (total !== '') total += separator
      total += val.toString();
    })
    return total;
  }

  if (meaningContent.kanji.length > 0) {
    return (<div onClick={() => {
      setMeaningContent(initialContentState)
    }} className={"z-[100] relative bg-blue-200/20 w-[100vw] h-[100vh]"}>
      <div
          className={"inset-x-0 mx-auto mt-10 bg-blue-100 z-[101] fixed rounded-lg w-[80vw] h-[60vh]"}>
        <div className={"bg-blue-100 p-5 rounded-t-lg"}>
          <div className={"text-5xl"} style={{
            top: "10vh",
            WebkitTextStrokeColor: "black",
            WebkitTextStrokeWidth: "1px",
            fontSize: "40px",
            fontFamily: "Arial",
            fontWeight: "bold",
          }}>{joinString(meaningContent.kanji.map(val => {
            return val.text
          }))}</div>
        </div>
        <div className={"bg-white w-full h-full rounded-b-lg text-blue-800 text-lg p-2"}>
          {
            meaningContent.sense.map((sense, idxSense) => {

              return <div
                  className={"bg-white rounded-lg flex flex-col gap-2 border-2 border-blue-700 m-4"}
                  key={idxSense}>
                <div
                    className={"rounded-t-lg bg-blue-200 px-3"}>{joinString(sense.partOfSpeech)}</div>
                <div className={"flex flex-row px-3"}>
                  <div className={'mx-2 mb-3'}>
                    <span className={"font-bold text-blue-8 mr-1"}>{idxSense + 1}.</span>
                    {
                      joinString(sense.gloss.map((gloss, idxGloss) => {
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