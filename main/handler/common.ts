import {registerStoreHandlers} from "./common/storeHandlers";
import {registerYoutubeHandlers} from "./common/youtubeHandlers";
import {registerBasicHandlers} from "./common/basicHandlers";
import {registerMediaHandlers} from "./common/mediaHandlers";
import {registerMediaToolHandlers} from "./common/mediaToolHandlers";
import {registerNetworkHandlers} from "./common/networkHandlers";
import {RegisterCommonHandlersArgs} from "./common/types";

export const registerCommonHandlers = (getTokenizer: RegisterCommonHandlersArgs["getTokenizer"], packageJson: RegisterCommonHandlersArgs["packageJson"], appDataDirectory: RegisterCommonHandlersArgs["appDataDirectory"]) => {
  registerStoreHandlers();
  registerYoutubeHandlers();
  registerBasicHandlers({getTokenizer, packageJson, appDataDirectory});
  registerMediaHandlers();
  registerMediaToolHandlers();
  registerNetworkHandlers();
};