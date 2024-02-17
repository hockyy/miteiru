const shortcutInformation = [
  {
    key: "⎵",
    description: "Toggle Pause"
  }, {
    key: "Z",
    description: "Toggle Video Control Bar"
  }, {
    key: "X",
    description: "Toggle Sidebar"
  }, {
    key: "Q",
    description: "Back to Home"
  }, {
    key: "Esc",
    description: "Exit From CJK Information Box"
  }, {
    key: "R",
    description: "Repeat Current Line"
  }, {
    key: "Y",
    description: "Toggle Show Transliterations"
  }, {
    key: "O",
    description: "Toggle Show CJK Subtitle"
  }, {
    key: "P",
    description: "Toggle Show Other/Secondary Subtitle"
  }, {
    key: "Ctrl + O",
    description: "Remove CJK Subtitle"
  }, {
    key: "Ctrl + P",
    description: "Remove Other/Secondary Subtitle"
  }, {
    key: "L",
    description: "Toggle Learning Mode"
  }, {
    key: "[",
    description: "Shift CJK Subtitle Slower"
  }, {
    key: "]",
    description: "Shift CJK Subtitle Faster"
  }, {
    key: "Ctrl + [",
    description: "Shift Main Subtitle Slower"
  }, {
    key: "Ctrl + ]",
    description: "Shift Main Subtitle Faster"
  }]

export const Key = ({value, extraClass = ""}) => {
  return <div
      className={"font-mono font-bold text-black bg-gray-100 rounded-lg px-3 py-2 unselectable border-[1px] border-black " + extraClass}
      style={{
        boxShadow: "3px 3px 0px 1px #9D9D9D"
      }}>
    {value}
  </div>
}

export const KeyboardHelp = () => {
  return <div
      className={"grid grid-cols-2 gap-5 content-start w-full md:w-4/5 px-5 py-3 m-2 bg-blue-50 rounded-lg border-2 border-black"}>
    {shortcutInformation.map((val, idx) => {
      return <div
          className={"font-mono font-bold text-black flex flex-row items-center gap-3 font-bold"}
          key={idx}><Key
          value={val.key}/> {val.description}</div>
    })}
  </div>
}