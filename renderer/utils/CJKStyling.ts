interface StrokeStyling {
  width: string
  color: string
  hoverColor: string
}

interface TextStyling {
  color: string
  hoverColor: string
  fontSize: string
  weight: number
}

interface LearningStateStyling {
  color: string,
  hoverColor: string
}

export interface AllLearningStateStyling {
  learningColor: LearningStateStyling[]
}

export interface CJKStyling {
  stroke: StrokeStyling
  text: TextStyling
  textMeaning?: TextStyling
  background: string
  position: string,
  learning?: boolean,
  positionFromTop: boolean,
  positionMeaningTop?: boolean
  maximalMeaningLengthPerCharacter?: number
  showFuriganaOnKana: boolean,
  showRomaji: boolean,
  showFurigana: boolean;
  showMeaning: boolean;
  showSpace?: boolean;
  removeHearingImpaired: boolean;
}


export const defaultMeaningBoxStyling: CJKStyling = {
  stroke: {
    width: "0px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#001fc4",
    hoverColor: "#5474ff",
    fontSize: "24px",
    weight: 200
  },
  background: "#00000000",
  position: "0vh",
  positionFromTop: true,
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true,
  showMeaning: false,
  removeHearingImpaired: false
}


export const defaultPrimarySubtitleStyling: CJKStyling = {
  stroke: {
    width: "0.22px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#ffdd00",
    hoverColor: "#00ffda",
    fontSize: "55px",
    weight: 600
  },
  textMeaning: {
    color: "#fadddd",
    hoverColor: "#00ffda",
    fontSize: "35px",
    weight: 400
  },
  background: "#000000ab",
  position: "1vh",
  positionFromTop: true,
  positionMeaningTop: false,
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true,
  showMeaning: true,
  showSpace: false,
  maximalMeaningLengthPerCharacter: 20,
  removeHearingImpaired: true,
  learning: true
}


export const defaultLearningStyling: CJKStyling = {
  stroke: {
    width: "0.34px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#ffdd00",
    hoverColor: "#00ffda",
    fontSize: "42px",
    weight: 600
  },
  textMeaning: {
    color: "#fadddd",
    hoverColor: "#00ffda",
    fontSize: "35px",
    weight: 600
  },
  learning: true,
  background: "#000000ab",
  position: "2vh",
  positionFromTop: true,
  positionMeaningTop: true,
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true,
  showMeaning: true,
  showSpace: true,
  maximalMeaningLengthPerCharacter: 7,
  removeHearingImpaired: true
}

export const defaultSecondarySubtitleStyling: CJKStyling = {
  stroke: {
    width: "0.76px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#ffffff",
    hoverColor: "#00ffda",
    fontSize: "52px",
    weight: 800
  },
  background: "#0000009c",
  position: "10vh",
  positionFromTop: false,
  showFuriganaOnKana: false,
  showFurigana: false,
  showRomaji: false,
  showMeaning: false,
  removeHearingImpaired: true
}

export const defaultLearningColorStyling: AllLearningStateStyling = {
  learningColor: [{
    color: "#f3f3f3",
    hoverColor: "#a1a1a1",
  }, {
    color: "#fff189",
    hoverColor: "#f1dc4f",
  }, {
    color: "#8effb9",
    hoverColor: "#00be4d",
  }, {
    color: "#69e3ff",
    hoverColor: "#13c7f1",
  }]

}