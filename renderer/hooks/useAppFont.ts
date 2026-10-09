import {useStoreData} from "./useStoreData";
import {DEFAULT_APP_FONT} from "../utils/fonts";

/** The interface font the user picked (a CSS font-family value), stored across sessions. */
export const useAppFont = () => useStoreData<string>("app.font", DEFAULT_APP_FONT);
