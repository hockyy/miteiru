import {isMixedJapanese} from "shunou";
import parse from "html-react-parser";

export const Sentence = ({
                           origin,
                           setMeaning,
                           separation,
                           addRomaji = true,
                           addHiragana = true,
                           extraClass
                         }) => {
  const handleChange = (origin) => {
    setMeaning(origin)
  }
  return <button className={extraClass} onClick={() => handleChange(origin)}>
    {separation.map((val, index) => {
      const hiragana = (<>
            <rp>(</rp>
            <rt>{val.hiragana ?? ''}</rt>
            <rp>)</rp>
          </>
      )
      const romaji = (<>
            <rp>(</rp>
            <rt>{val.romaji ?? ''}</rt>
            <rp>)</rp>
          </>
      )
      const showFurigana = (val.isKana || val.isKanji || val.isMixed || isMixedJapanese(origin));
      return <ruby style={{rubyPosition: "under"}} key={index}>
        <ruby style={{rubyPosition: "over"}}>
          {val.main}
          {showFurigana && addHiragana && hiragana}
        </ruby>
        {showFurigana && addRomaji && romaji}
      </ruby>
    })}
  </button>
}

export const PlainSentence = ({origin}) => {
  return <div>{parse(origin)}</div>
}
