import {Cogs} from "./Icons";

export const SettingsController = ({setShowSidebar}) => {
  return <button onClick={() => {
    setShowSidebar(old => !old)
  }
  }>
    <div className={"animation h-5"}>
      {Cogs}
    </div>
  </button>
}

export default SettingsController;