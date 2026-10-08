import {ipcMain} from "electron";
import {analyzeText} from "./analyzer";

export type RegisterAnalyzerHandlersArgs = {
  getTokenizer: () => string;
  getToneType?: () => Promise<string>;
  getMecabCommand?: () => string;
};

export const registerAnalyzerHandlers = ({
  getTokenizer,
  getToneType = async () => "num",
  getMecabCommand = () => undefined
}: RegisterAnalyzerHandlersArgs) => {
  ipcMain.handle("analyzeText", async (_event, sentence: string, toneType?: string) => analyzeText(sentence, {
    tokenizerMode: getTokenizer(),
    toneType: toneType ?? await getToneType(),
    mecabCommand: getMecabCommand()
  }));
};
