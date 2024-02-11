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
    width: "1px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#ffdd00",
    hoverColor: "#00ffda",
    fontSize: "35px",
    weight: 800,
  },
  textMeaning: {
    color: "#ffffff",
    hoverColor: "#00ffda",
    fontSize: "35px",
    weight: 800,
  },
  background: "#000000A5",
  learning: true,
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


export const defaultLearningStyling: CJKStyling = {
  stroke: {
    width: "5px",
    color: "#00000000",
    hoverColor: "#00000000"
  },
  text: {
    color: "#000000",
    hoverColor: "#860000",
    fontSize: "30px",
    weight: 200,
  },
  textMeaning: {
    color: "#d70000",
    hoverColor: "#860000",
    fontSize: "35px",
    weight: 200,
  },
  background: "rgba(0,0,0,0)",
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
    width: "1px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#FFFFFF",
    hoverColor: "#ffcc00",
    fontSize: "35px",
    weight: 800,
  },
  background: "#000000A5",
  position: "2vh",
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
  },{
    color: "#fff189",
    hoverColor: "#f1dc4f",
  },{
    color: "#8effb9",
    hoverColor: "#00be4d",
  },{
    color: "#69e3ff",
    hoverColor: "#13c7f1",
  }]

}