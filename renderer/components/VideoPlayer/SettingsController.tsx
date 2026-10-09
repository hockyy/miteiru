import {Cogs} from "./Icons";

export const SettingsController = ({setShowSidebar}) => {
  return <button aria-label="Settings" title="Settings (X)" onClick={() => {
    setShowSidebar(old => !old)
  }
  }>
    <div className={"animation h-5"}>
      {Cogs}
    </div>
  </button>
}

export default SettingsController;