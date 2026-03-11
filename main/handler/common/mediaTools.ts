import {spawn} from "child_process";
import path from "path";
import * as fsPromises from "node:fs/promises";

interface ToolConfig {
  name: string;
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

export function getMiteiruToolsPath(): string {
  const os = require("os");
  return path.join(os.tmpdir(), "miteiru_tools");
}

export async function checkToolPath(tool: ToolConfig): Promise<{ available: boolean; path: string | null; isInternal: boolean }> {
  const miteiruToolsPath = getMiteiruToolsPath();
  const internalPath = path.join(miteiruToolsPath, tool.executable_name);

  try {
    await fsPromises.access(internalPath);
    const internalWorks = await new Promise<boolean>((resolve) => {
      const child = spawn(internalPath, [tool.check_command]);
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });

    if (internalWorks) {
      return {available: true, path: internalPath, isInternal: true};
    }
  } catch (error) {
    // Internal tool missing or invalid, continue to system PATH check.
  }

  const systemWorks = await new Promise<boolean>((resolve) => {
    const child = spawn(tool.name, [tool.check_command]);
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });

  if (systemWorks) {
    return {available: true, path: tool.name, isInternal: false};
  }

  return {available: false, path: null, isInternal: false};
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

    for (const tool of MEDIA_TOOLS_CONFIG) {
      const toolCheck = await checkToolPath(tool);

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
    const someAvailable = availableTools.length > 0;

    const result = {
      ok: allAvailable ? 1 : someAvailable ? 0 : 0,
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
