interface StrokeStyling {
  width: string
  color: string
  hoverColor: string
}

interface TextStyling {
  color: string
  hoverColor: string
  fontSize: string
}

export interface CJKStyling {
  stroke: StrokeStyling
  text: TextStyling
  textMeaning?: TextStyling
  background: string
  position: string,
  positionFromTop: boolean,
  positionMeaningTop?: boolean
  maximalMeaningLengthPerCharacter?: number
  showFuriganaOnKana: boolean,
  showRomaji: boolean,
  showFurigana: boolean;
  showMeaning: boolean;
}


export const defaultMeaningBoxStyling: CJKStyling = {
  stroke: {
    width: "0px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#001fc4",
    hoverColor: "#001269",
    fontSize: "24px",
  },
  background: "#00000000",
  position: "0vh",
  positionFromTop: true,
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true,
  showMeaning: false
}


export const defaultPrimarySubtitleStyling: CJKStyling = {
  stroke: {
    width: "1px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#ffdd00",
    hoverColor: "#00ffda",
    fontSize: "35px",
  },
  textMeaning: {
    color: "#ffffff",
    hoverColor: "#00ffda",
    fontSize: "35px",
  },
  background: "#000000A5",
  position: "2vh",
  positionFromTop: true,
  positionMeaningTop: true,
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true,
  showMeaning: true,
  maximalMeaningLengthPerCharacter: 7,
}

export const defaultSecondarySubtitleStyling: CJKStyling = {
  stroke: {
    width: "1px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#FFFFFF",
    hoverColor: "#ffcc00",
    fontSize: "35px",
  },
  background: "#000000A5",
  position: "2vh",
  positionFromTop: false,
  showFuriganaOnKana: false,
  showFurigana: false,
  showRomaji: false,
  showMeaning: false
}
