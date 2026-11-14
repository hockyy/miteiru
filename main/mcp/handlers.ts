import {ipcMain} from "../../renderer/platform/backend/shims/desktop";
import {runtime} from "../../renderer/platform/backend/shims/runtime";
import {declineOpenRequest, takeOpenRequest} from "./windowRequests";

/**
 * The program path as one shell word. Windows paths can't hold a double quote; on macOS and Linux a
 * double-quoted path still expands $ and backticks, so it is single-quoted there.
 */
const shellWord = (text: string, platform: string) => (
  platform === "win32" ? `"${text}"` : `'${text.replace(/'/g, `'\\''`)}'`
);

/** What Settings shows for connecting an AI assistant to this Miteiru. */
export const assistantConnectInfo = (command: string, platform: string = process.platform) => ({
  command,
  claudeCode: `claude mcp add miteiru -- ${shellWord(command, platform)} --mcp`,
  json: JSON.stringify({mcpServers: {miteiru: {command, args: ["--mcp"]}}}, null, 2),
  // macOS runs an app opened straight from Downloads from a temporary copy whose path changes on every
  // launch, so a command saved now would stop working.
  warning: /\/AppTranslocation\//.test(command)
    ? "macOS is running Miteiru from a temporary copy. Move Miteiru to your Applications folder and open it from there, or this command stops working."
    : null
});

export const registerAssistantHandlers = () => {
  // The video page asks once it can open a video, and again on each assistant:open-video event.
  ipcMain.handle("assistant:take-open-request", async () => takeOpenRequest());
  // A page holding typed text asked the learner first, and they chose to stay.
  ipcMain.handle("assistant:decline-open-request", async () => declineOpenRequest());
  // The AppImage path when running from one, else this executable (src-tauri/src/sys/info.rs).
  ipcMain.handle("assistant:connect-info", async () => assistantConnectInfo(runtime.mcpCommand || runtime.exePath));
};
