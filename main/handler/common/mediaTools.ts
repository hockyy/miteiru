import {spawn} from "child_process";
import os from "node:os";
import path from "path";
import * as fsPromises from "node:fs/promises";
import {app} from "electron";

export type ToolName = "yt-dlp" | "ffmpeg" | "ffprobe";

interface ToolConfig {
  name: ToolName;
  check_command: string;
  download_link: string;
  executable_name: string;
  internal_path?: string;
}

export const MEDIA_TOOLS_CONFIG: ToolConfig[] = [
  {
    name: "yt-dlp",
    check_command: "--version",
    download_link: "https://github.com/hockyy/miteiru/releases/download/assets/yt-dlp.exe",
    executable_name: process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  },
  {
    name: "ffmpeg",
    check_command: "-version",
    download_link: "https://ffmpeg.org/download.html",
    executable_name: process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  },
  {
    name: "ffprobe",
    check_command: "-version",
    download_link: "https://ffmpeg.org/download.html",
    executable_name: process.platform === "win32" ? "ffprobe.exe" : "ffprobe"
  }
];

const mediaToolsCache = {
  result: null,
  timestamp: 0,
  CACHE_DURATION: 30000
};

/** Folder where users put their own yt-dlp / ffmpeg / ffprobe for Miteiru. */
export function getMiteiruToolsPath(): string {
  return path.join(app.getPath("userData"), "tools");
}

// Older versions used <temp>/miteiru_tools. Temp is per-user on Windows and macOS, so tools
// placed there still count; on Linux /tmp is shared, and another user could plant a binary.
const legacyToolsPath = (): string | null =>
  process.platform === "linux" ? null : path.join(os.tmpdir(), "miteiru_tools");

const localToolPaths = (executableName: string): string[] =>
  [getMiteiruToolsPath(), legacyToolsPath()]
    .filter((dir): dir is string => Boolean(dir))
    .map((dir) => path.join(dir, executableName));

const findTool = (name: ToolName): ToolConfig => MEDIA_TOOLS_CONFIG.find((tool) => tool.name === name);

/** The command to run for a tool: the user's local copy when present, otherwise the name on PATH. */
export async function resolveToolCommand(name: ToolName): Promise<string> {
  const tool = findTool(name);
  for (const candidate of localToolPaths(tool.executable_name)) {
    try {
      await fsPromises.access(candidate);
      return candidate;
    } catch {
      // Not placed here; try the next location.
    }
  }
  return tool.name;
}

const runsSuccessfully = (command: string, args: string[]) => new Promise<boolean>((resolve) => {
  const child = spawn(command, args);
  child.on("close", (code) => resolve(code === 0));
  child.on("error", () => resolve(false));
});

export async function checkToolPath(tool: ToolConfig): Promise<{ available: boolean; path: string | null; isInternal: boolean }> {
  for (const internalPath of localToolPaths(tool.executable_name)) {
    try {
      await fsPromises.access(internalPath);
    } catch {
      continue;
    }
    if (await runsSuccessfully(internalPath, [tool.check_command])) {
      return {available: true, path: internalPath, isInternal: true};
    }
  }

  if (await runsSuccessfully(tool.name, [tool.check_command])) {
    return {available: true, path: tool.name, isInternal: false};
  }

  return {available: false, path: null, isInternal: false};
}

/** The command for a tool that must be present; throws a message saying where to put it when it is not. */
export async function requireMediaTool(name: ToolName): Promise<string> {
  const {available, path: toolPath} = await checkToolPath(findTool(name));
  if (!available || !toolPath) {
    throw new Error(`${name} was not found. Put ${findTool(name).executable_name} in ${getMiteiruToolsPath()} or on your PATH.`);
  }
  return toolPath;
}

export async function checkMediaTools(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && mediaToolsCache.result &&
    (now - mediaToolsCache.timestamp) < mediaToolsCache.CACHE_DURATION) {
    console.log("[Media Tools Check] Using cached result");
    return mediaToolsCache.result;
  }

  if (forceRefresh) {
    console.log("[Media Tools Check] Force refresh requested");
  }

  console.log("[Media Tools Check] Performing fresh check...");

  try {
    const toolsStatus = {};
    const missingTools = [];
    const availableTools = [];

    const toolChecks = await Promise.all(MEDIA_TOOLS_CONFIG.map((tool) => checkToolPath(tool)));
    for (const [index, tool] of MEDIA_TOOLS_CONFIG.entries()) {
      const toolCheck = toolChecks[index];

      toolsStatus[tool.name] = {
        available: toolCheck.available,
        path: toolCheck.path,
        isInternal: toolCheck.isInternal,
        config: tool
      };

      if (toolCheck.available) {
        availableTools.push(`${tool.name}${toolCheck.isInternal ? " (internal)" : ""}`);
      } else {
        missingTools.push(tool.name);
      }

      console.log(`[Media Tools Check] ${tool.name}: ${toolCheck.available ? "OK" : "Missing"} ${toolCheck.isInternal ? "(internal)" : "(system)"}`);
    }

    const allAvailable = missingTools.length === 0;

    const result = {
      ok: allAvailable ? 1 : 0,
      message: allAvailable
        ? `All optional tools available: ${availableTools.join(", ")}`
        : missingTools.length === MEDIA_TOOLS_CONFIG.length
          ? "No optional tools found (app will work without them)"
          : `Available: ${availableTools.join(", ")} | Optional: ${missingTools.join(", ")}`,
      details: toolsStatus,
      missingTools,
      availableTools,
      cached: false
    };

    mediaToolsCache.result = {...result, cached: true};
    mediaToolsCache.timestamp = now;

    console.log("[Media Tools Check] Fresh check completed, result cached");
    return result;
  } catch (error) {
    const errorResult = {
      ok: 0,
      message: `Error checking optional tools: ${error.message}`,
      details: {},
      missingTools: MEDIA_TOOLS_CONFIG.map(t => t.name),
      availableTools: [],
      cached: false
    };

    mediaToolsCache.result = {...errorResult, cached: true};
    mediaToolsCache.timestamp = now;

    return errorResult;
  }
}
