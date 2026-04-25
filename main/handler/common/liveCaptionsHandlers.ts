import {app, BrowserWindow, ipcMain} from "electron";
import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import path from "path";
import fs from "fs";

type LiveCaptionsState = "unsupported" | "stopped" | "starting" | "running" | "error";

interface LiveCaptionsBridgeMessage {
  type?: "caption" | "state" | "error" | "debug";
  text?: string;
  message?: string;
}

let bridgeProcess: ChildProcessWithoutNullStreams | null = null;
let state: LiveCaptionsState = process.platform === "win32" ? "stopped" : "unsupported";
let latestCaption = "";
let latestError = "";
let latestDebugMessages: string[] = [];
let startupWatchdog: NodeJS.Timeout | null = null;

const bridgeExecutableName = process.platform === "win32"
  ? "MiteiruLiveCaptionsBridge.exe"
  : "MiteiruLiveCaptionsBridge";

const sendToRenderers = (channel: string, payload: unknown) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
};

const addDebugMessage = (message: string) => {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  latestDebugMessages = [...latestDebugMessages.slice(-19), entry];
  console.log(`[LiveCaptions] ${message}`);
  sendToRenderers("live-captions:debug", entry);
};

const setState = (nextState: LiveCaptionsState) => {
  state = process.platform === "win32" ? nextState : "unsupported";
  addDebugMessage(`State changed to ${state}`);
  sendToRenderers("live-captions:state", getState());
};

const setError = (message: string) => {
  latestError = message;
  if (startupWatchdog) {
    clearTimeout(startupWatchdog);
    startupWatchdog = null;
  }
  setState("error");
  sendToRenderers("live-captions:error", message);
};

const clearStartupWatchdog = () => {
  if (!startupWatchdog) return;
  clearTimeout(startupWatchdog);
  startupWatchdog = null;
};

const getState = () => ({
  supported: process.platform === "win32",
  state,
  running: bridgeProcess !== null,
  latestCaption,
  latestError,
  debugMessages: latestDebugMessages
});

const getBridgeCandidates = () => {
  const candidates = [
    path.join(process.resourcesPath ?? "", "live-captions", bridgeExecutableName),
    path.join(app.getAppPath(), "native", "live-captions", "bin", "Release", "net8.0-windows", "win-x64", "publish", bridgeExecutableName),
    path.join(app.getAppPath(), "native", "live-captions", "bin", "Debug", "net8.0-windows", "win-x64", "publish", bridgeExecutableName),
    path.join(app.getAppPath(), "native", "live-captions", "bin", "Release", "net8.0-windows", bridgeExecutableName),
    path.join(app.getAppPath(), "native", "live-captions", "bin", "Debug", "net8.0-windows", bridgeExecutableName)
  ];

  return candidates.filter((candidate, index) => candidate && candidates.indexOf(candidate) === index);
};

const getBridgePath = () => {
  const bridgePath = getBridgeCandidates().find((candidate) => fs.existsSync(candidate));

  if (!bridgePath) {
    addDebugMessage(`Helper not found. Checked: ${getBridgeCandidates().join(" | ")}`);
    throw new Error("Live Captions helper is not built. Run npm run build:live-captions first.");
  }

  addDebugMessage(`Using helper at ${bridgePath}`);
  return bridgePath;
};

const handleBridgeLine = (line: string) => {
  if (!line.trim()) return;

  let message: LiveCaptionsBridgeMessage;
  try {
    message = JSON.parse(line);
  } catch {
    addDebugMessage(`Ignored non-JSON helper output: ${line}`);
    return;
  }

  if (message.type === "caption") {
    latestCaption = message.text ?? "";
    latestError = "";
    if (state !== "running") setState("running");
    if (latestCaption) addDebugMessage(`Caption update (${latestCaption.length} chars)`);
    sendToRenderers("live-captions:caption", latestCaption);
    return;
  }

  if (message.type === "state") {
    addDebugMessage(`Helper state: ${message.message ?? "unknown"}`);
    if (message.message === "started" || message.message === "restarted") {
      latestError = "";
      clearStartupWatchdog();
      setState("running");
    } else if (message.message === "stopped") {
      setState("stopped");
    }
    return;
  }

  if (message.type === "error") {
    setError(message.message ?? "Live Captions helper failed.");
    return;
  }

  if (message.type === "debug") {
    addDebugMessage(`Helper: ${message.message ?? ""}`);
  }
};

const startBridge = () => {
  if (process.platform !== "win32") {
    addDebugMessage("Start ignored: Live Captions is Windows-only.");
    return getState();
  }

  if (bridgeProcess) {
    addDebugMessage("Start ignored: helper is already running.");
    return getState();
  }

  const bridgePath = getBridgePath();
  latestCaption = "";
  latestError = "";
  sendToRenderers("live-captions:caption", latestCaption);
  setState("starting");
  addDebugMessage("Starting Live Captions helper process...");

  bridgeProcess = spawn(bridgePath, [], {
    windowsHide: true
  });

  startupWatchdog = setTimeout(() => {
    if (state !== "starting" || !bridgeProcess) return;

    addDebugMessage("Startup timed out before helper reported ready.");
    const processToStop = bridgeProcess;
    bridgeProcess = null;
    processToStop.kill();
    setError(
      "Live Captions helper started but never became ready. Open Windows Live Captions once with Win+Ctrl+L, finish its setup, then try again."
    );
  }, 15000);

  let stdoutBuffer = "";
  let stderrBuffer = "";

  bridgeProcess.stdout.setEncoding("utf8");
  bridgeProcess.stdout.on("data", (chunk: string) => {
    addDebugMessage(`Helper stdout chunk (${chunk.length} chars)`);
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    lines.forEach(handleBridgeLine);
  });

  bridgeProcess.stderr.setEncoding("utf8");
  bridgeProcess.stderr.on("data", (chunk: string) => {
    addDebugMessage(`Helper stderr: ${chunk.trim()}`);
    stderrBuffer += chunk;
  });

  bridgeProcess.on("error", (error) => {
    bridgeProcess = null;
    clearStartupWatchdog();
    addDebugMessage(`Helper spawn error: ${error.message}`);
    setError(error.message);
  });

  bridgeProcess.on("close", (code) => {
    bridgeProcess = null;
    clearStartupWatchdog();
    addDebugMessage(`Helper closed with code ${code}`);
    if (code === 0 || state === "stopped") {
      setState("stopped");
      return;
    }

    setError(stderrBuffer.trim() || `Live Captions helper exited with code ${code}.`);
  });

  return getState();
};

const stopBridge = () => {
  if (bridgeProcess) {
    const processToStop = bridgeProcess;
    bridgeProcess = null;
    clearStartupWatchdog();
    addDebugMessage("Stopping Live Captions helper process...");
    processToStop.kill();
  } else {
    addDebugMessage("Stop requested while helper was not running.");
  }

  latestCaption = "";
  setState(process.platform === "win32" ? "stopped" : "unsupported");
  sendToRenderers("live-captions:caption", latestCaption);
  return getState();
};

export function registerLiveCaptionsHandlers() {
  ipcMain.handle("live-captions:is-supported", async () => process.platform === "win32");
  ipcMain.handle("live-captions:get-state", async () => getState());
  ipcMain.handle("live-captions:start", async () => startBridge());
  ipcMain.handle("live-captions:stop", async () => stopBridge());

  app.on("before-quit", () => {
    if (bridgeProcess) {
      bridgeProcess.kill();
      bridgeProcess = null;
    }
  });
}
