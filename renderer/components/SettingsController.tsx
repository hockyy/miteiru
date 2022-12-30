import {Cogs} from "./Icons";

export const SettingsController = () => {
  return <button onClick={() => {
    console.log("Clicked")
  }
  }>
    <div className={"animation h-5"}>
      {Cogs}
    </div>
  </button>
}

export default SettingsController;