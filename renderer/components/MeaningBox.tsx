const MeaningBox = (jmWord) => {
  const tmp = {
    "id": "1445650",
    "kanji": [
      {
        "common": true,
        "text": "奴隷",
        "tags": []
      }
    ],
    "kana": [
      {
        "common": true,
        "text": "どれい",
        "tags": [],
        "appliesToKanji": [
          "*"
        ]
      }
    ],
    "sense": [
      {
        "partOfSpeech": [
          "n",
          "adj-no"
        ],
        "appliesToKanji": [],
        "appliesToKana": [],
        "related": [],
        "antonym": [],
        "field": [],
        "dialect": [],
        "info": [],
        "languageSource": [],
        "gloss": [
          {
            "lang": "eng",
            "gender": null,
            "type": null,
            "text": "slave"
          },
          {
            "lang": "eng",
            "gender": null,
            "type": null,
            "text": "servant"
          }
        ]
      },
      {
        "partOfSpeech": [
          "n",
          "adj-no"
        ],
        "appliesToKanji": [],
        "appliesToKana": [],
        "related": [],
        "antonym": [],
        "field": [],
        "dialect": [],
        "info": [],
        "languageSource": [],
        "gloss": [
          {
            "lang": "eng",
            "gender": null,
            "type": null,
            "text": "slavery"
          }
        ]
      }
    ]
  };
  return <div
      className={"inset-x-0 mx-auto mt-10 bg-blue-100 z-[101] fixed rounded-lg w-[80vw] h-[60vh]"}>
    <div className={"bg-blue-100 p-5 rounded-t-lg"}>
      <div className={"text-5xl"} style={{
        top: "10vh",
        WebkitTextStrokeColor: "black",
        WebkitTextStrokeWidth: "1px",
        fontSize: "40px",
        fontFamily: "Arial",
        fontWeight: "bold",
      }}>{tmp.kanji[0].text}</div>
    </div>
    <div className={"bg-white w-full h-full rounded-b-lg text-blue-800"}>
      {
        tmp.sense.map((sense, idxSense) => {

          return <div key={idxSense}>
            <div className={"flex flex-row gap-2"}>

              <div>{idxSense + 1}.</div>
              {
                sense.gloss.map((gloss, idxGloss) => {
                  return (
                      <div key={idxGloss}>
                        {gloss.text}
                      </div>
                  );
                })
              }
            </div>
          </div>
        })
      }
    </div>
  </div>
}

export default MeaningBox;