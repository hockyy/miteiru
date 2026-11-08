import {registerStoreHandlers} from "./common/storeHandlers";
import {registerYoutubeHandlers} from "./common/youtubeHandlers";
import {registerBoxTipsHandlers} from "./common/boxTipsHandlers";
import {registerYoutubeTranscriptionHandlers} from "./common/youtubeTranscriptionHandlers";
import {registerUserDictionaryHandlers} from "./common/userDictionaryHandlers";
import {registerAiUsageHandlers} from "./common/aiUsageHandlers";
import {registerBasicHandlers} from "./common/basicHandlers";
import {registerMediaHandlers} from "./common/mediaHandlers";
import {registerMediaToolHandlers} from "./common/mediaToolHandlers";
import {registerNetworkHandlers} from "./common/networkHandlers";
import {registerLiveCaptionsHandlers} from "./common/liveCaptionsHandlers";
import {RegisterCommonHandlersArgs} from "./common/types";

export const registerCommonHandlers = (getTokenizer: RegisterCommonHandlersArgs["getTokenizer"], packageJson: RegisterCommonHandlersArgs["packageJson"], appDataDirectory: RegisterCommonHandlersArgs["appDataDirectory"]) => {
  registerStoreHandlers();
  registerAiUsageHandlers();
  registerYoutubeHandlers();
  registerBoxTipsHandlers();
  registerYoutubeTranscriptionHandlers(appDataDirectory);
  registerUserDictionaryHandlers();
  registerBasicHandlers({getTokenizer, packageJson, appDataDirectory});
  registerMediaHandlers();
  registerMediaToolHandlers();
  registerNetworkHandlers();
  registerLiveCaptionsHandlers(getTokenizer);
};
