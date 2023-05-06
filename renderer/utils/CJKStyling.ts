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
  background: string
  positionFromTop: string,
  showFuriganaOnKana: boolean,
  showRomaji: boolean,
  showFurigana: boolean;
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
  positionFromTop: "100vh",
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true
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
    fontSize: "24px",
  },
  background: "#000000A5",
  positionFromTop: "10vh",
  showFuriganaOnKana: false,
  showFurigana: true,
  showRomaji: true
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
    fontSize: "24px",
  },
  background: "#000000A5",
  positionFromTop: "10vh",
  showFuriganaOnKana: false,
  showFurigana: false,
  showRomaji: false
}
