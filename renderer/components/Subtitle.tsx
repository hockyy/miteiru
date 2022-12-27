import React, {useEffect, useState} from "react";

import parse from 'html-react-parser';
import Sentence from "./Sentence";

const example = [
  {
    "origin": "アニメ",
    "hiragana": "あにめ",
    "basicForm": "アニメ-animation",
    "pos": "名詞-普通名詞-一般",
    "separation": [
      {
        "bottom": "ア",
        "top": null
      },
      {
        "bottom": "ニ",
        "top": null
      },
      {
        "bottom": "メ",
        "top": null
      }
    ]
  },
  {
    "origin": "を",
    "hiragana": "お",
    "basicForm": "を",
    "pos": "助詞-格助詞",
    "separation": [
      {
        "bottom": "を",
        "top": null
      }
    ]
  },
  {
    "origin": "見",
    "hiragana": "み",
    "basicForm": "見る",
    "pos": "動詞-非自立可能",
    "separation": [
      {
        "bottom": "見",
        "top": "み"
      }
    ]
  },
  {
    "origin": "て",
    "hiragana": "て",
    "basicForm": "て",
    "pos": "助詞-接続助詞",
    "separation": [
      {
        "bottom": "て",
        "top": null
      }
    ]
  },
  {
    "origin": "い",
    "hiragana": "い",
    "basicForm": "居る",
    "pos": "動詞-非自立可能",
    "separation": [
      {
        "bottom": "い",
        "top": null
      }
    ]
  },
  {
    "origin": "ます",
    "hiragana": "ます",
    "basicForm": "ます",
    "pos": "助動詞",
    "separation": [
      {
        "bottom": "ま",
        "top": null
      },
      {
        "bottom": "す",
        "top": null
      }
    ]
  }
]

export const Subtitle = (props) => {
  const [caption, setCaption] = useState([])
  useEffect(() => {
    let current = example.map((val, index) => {
      return <Sentence key={index} origin={val.origin} separation={val.separation}/>
    })
    setCaption(current)

  }, []);
  return <div style={{
    WebkitTextStrokeColor: "black",
    WebkitTextStrokeWidth: "1px",
    fontSize: "50px",
    fontFamily: "Arial",
    fontWeight: "bold",
  }}>
    {caption}
  </div>
}

export default Subtitle