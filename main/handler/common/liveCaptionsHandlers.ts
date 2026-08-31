import {app, BrowserWindow, ipcMain} from "electron";
import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import path from "path";
import fs from "fs";
import type {LiveCaptionsApiState, LiveCaptionsState} from "../../../renderer/types/liveCaptions";
import {isLiveCaptionsSupported, getLiveCaptionsBridgeCandidates} from "../../helpers/liveCaptionsSupport";

interface LiveCaptionsBridgeMessage {
  type?: "caption" | "state" | "error" | "debug";
  text?: string;
  message?: string;
}

const supported = isLiveCaptionsSupported();

let bridgeProcess: ChildProcessWithoutNullStreams | null = null;
let state: LiveCaptionsState = supported ? "stopped" : "unsupported";
let latestCaption = "";
let latestError = "";
let latestDebugMessages: string[] = [];
let startupWatchdog: NodeJS.Timeout | null = null;

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
  state = supported ? nextState : "unsupported";
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

const getState = (): LiveCaptionsApiState => ({
  supported,
  state,
  running: bridgeProcess !== null,
  latestCaption,
  latestError,
  debugMessages: latestDebugMessages
});

const getBridgeCandidates = () => getLiveCaptionsBridgeCandidates({
  platform: process.platform,
  resourcesPath: process.resourcesPath,
  cwd: process.cwd(),
  appPath: app.getAppPath()
});

const getBridgePath = () => {
  const candidates = getBridgeCandidates();
  const bridgePath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!bridgePath) {
    addDebugMessage(`Helper not found. Checked: ${candidates.join(" | ")}`);
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

const createBridgeProcess = (bridgePath: string) => spawn(bridgePath, [], {
  windowsHide: true,
  cwd: path.dirname(bridgePath)
});

const startupTimeoutMessage = () => {
  if (process.platform === "darwin") {
    return "Live Captions helper started but never became ready. Grant Screen & System Audio Recording to Miteiru in System Settings, then try again.";
  }

  return "Live Captions helper started but never became ready. Open Windows Live Captions once with Win+Ctrl+L, finish its setup, then try again.";
};

const armStartupWatchdog = () => {
  startupWatchdog = setTimeout(() => {
    if (state !== "starting" || !bridgeProcess) return;

    addDebugMessage("Startup timed out before helper reported ready.");
    const processToStop = bridgeProcess;
    bridgeProcess = null;
    processToStop.kill();
    setError(startupTimeoutMessage());
  }, 15000);
};

const wireBridgeStreams = (processToWire: ChildProcessWithoutNullStreams) => {
  let stdoutBuffer = "";
  let stderrBuffer = "";

  processToWire.stdout.setEncoding("utf8");
  processToWire.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    lines.forEach(handleBridgeLine);
  });

  processToWire.stderr.setEncoding("utf8");
  processToWire.stderr.on("data", (chunk: string) => {
    addDebugMessage(`Helper stderr: ${chunk.trim()}`);
    stderrBuffer += chunk;
  });

  processToWire.on("error", (error) => {
    if (bridgeProcess !== processToWire) return;
    bridgeProcess = null;
    clearStartupWatchdog();
    addDebugMessage(`Helper spawn error: ${error.message}`);
    setError(error.message);
  });

  processToWire.on("close", (code) => {
    const wasCurrentProcess = bridgeProcess === processToWire;
    if (wasCurrentProcess) {
      bridgeProcess = null;
      clearStartupWatchdog();
    }

    addDebugMessage(`Helper closed with code ${code}`);
    if (!wasCurrentProcess) return;

    if (code === 0 || state === "stopped") {
      setState("stopped");
      return;
    }

    setError(stderrBuffer.trim() || `Live Captions helper exited with code ${code}.`);
  });
};

const startBridge = () => {
  if (!supported) {
    addDebugMessage("Start ignored: Live Captions is not supported on this system.");
    return getState();
  }

  if (bridgeProcess) {
    addDebugMessage("Start ignored: helper is already running.");
    return getState();
  }

  try {
    const bridgePath = getBridgePath();
    latestCaption = "";
    latestError = "";
    sendToRenderers("live-captions:caption", latestCaption);
    setState("starting");
    addDebugMessage("Starting Live Captions helper process...");

    bridgeProcess = createBridgeProcess(bridgePath);
    armStartupWatchdog();
    wireBridgeStreams(bridgeProcess);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addDebugMessage(`Start failed: ${message}`);
    setError(message);
  }

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
  setState(supported ? "stopped" : "unsupported");
  sendToRenderers("live-captions:caption", latestCaption);
  return getState();
};

export function registerLiveCaptionsHandlers() {
  ipcMain.handle("live-captions:is-supported", async () => supported);
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
