import {ipcMain} from "../../../renderer/platform/backend/shims/desktop";
import {analyzeText} from "./analyzer";

export type RegisterAnalyzerHandlersArgs = {
  getTokenizer: () => string;
  getToneType?: () => Promise<string>;
};

export const registerAnalyzerHandlers = ({
  getTokenizer,
  getToneType = async () => "num"
}: RegisterAnalyzerHandlersArgs) => {
  ipcMain.handle("analyzeText", async (_event, sentence: string, toneType?: string) => analyzeText(sentence, {
    tokenizerMode: getTokenizer(),
    toneType: toneType ?? await getToneType()
  }));
};
