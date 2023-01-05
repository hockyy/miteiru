interface StrokeStyling {
  width: string
  color: string
  hoverColor: string
}

interface TextStyling {
  color: string
  hoverColor: string
}

export interface CJKStyling {
  stroke: StrokeStyling
  text: TextStyling
  background: string
}


export const defaultMeaningBoxStyling: CJKStyling = {
  stroke: {
    width: "0px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#001fc4",
    hoverColor: "#001269"
  },
  background: "#00000000"
}


export const defaultPrimarySubtitleStyling: CJKStyling = {
  stroke: {
    width: "1px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#ffdd00",
    hoverColor: "#00ffda"
  },
  background: "#000000A5"
}

export const defaultSecondarySubtitleStyling: CJKStyling = {
  stroke: {
    width: "1px",
    color: "#000000",
    hoverColor: "#000000"
  },
  text: {
    color: "#FFFFFF",
    hoverColor: "#ffcc00"
  },
  background: "#000000A5"
}
