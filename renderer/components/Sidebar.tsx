import {ArrowLeft, Cogs} from "./Icons";

export const Sidebar = ({showSidebar, setShowSidebar}) => {

  return <div style={{
    transition: "all 0.3s ease-out",
    transform: `translate(${!showSidebar ? "25vw" : "0"}, 0`
  }}
              className={"flex flex-col content-center items-center p-3 z-[19] fixed right-0 top-0 h-screen w-[25vw] bg-gray-700/70"}>

    <button className={"self-start p-2"} onClick={() => {
      setShowSidebar(old => !old)
    }
    }>
      <div className={"animation h-5"}>
        {ArrowLeft}
      </div>
    </button>
    <div className={"font-bold unselectable text-3xl m-4"}>
      Settings
    </div>
    <div className={"flex flex-col content-start gap-3 unselectable"}>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        CJK Subtitle Text Color
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        CJK Subtitle Hover Color
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        CJK Subtitle Stroke Color
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        CJK Background Color
      </div>
    </div>
    <hr className={"w-full h-1 m-5"}/>
    <div className={"flex flex-col content-start gap-3 "}>
      <div className={"flex flex-row items-center gap-3 unselectable"}>
        <input type={"color"}/>
        <div>Other Subtitle Text Color</div>
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        Other Subtitle Hover Color
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        Other Subtitle Stroke Color
      </div>
      <div className={"flex flex-row items-center gap-3"}>
        <input type={"color"}/>
        Other Background Color
      </div>
    </div>
  </div>
}