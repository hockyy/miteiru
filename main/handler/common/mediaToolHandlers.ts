import {ipcMain} from "electron";
import axios from "axios";
import * as fsPromises from "node:fs/promises";
import path from "path";
import {MEDIA_TOOLS_CONFIG, checkMediaTools, getMiteiruToolsPath} from "./mediaTools";

export function registerMediaToolHandlers() {
  ipcMain.handle("checkMediaTools", async (event, forceRefresh = false) => {
    return await checkMediaTools(forceRefresh);
  });

  ipcMain.handle("downloadTool", async (event, toolName) => {
    console.log(`[IPC] downloadTool called for ${toolName}`);

    const tool = MEDIA_TOOLS_CONFIG.find(t => t.name === toolName);
    if (!tool) {
      return {success: false, error: `Unknown tool: ${toolName}`};
    }

    try {
      const toolsDir = getMiteiruToolsPath();
      await fsPromises.mkdir(toolsDir, {recursive: true});

      const downloadPath = path.join(toolsDir, tool.executable_name);

      console.log(`[IPC] Downloading ${tool.name} from ${tool.download_link}`);
      console.log(`[IPC] Download path: ${downloadPath}`);

      const response = await axios.get(tool.download_link, {
        responseType: "stream",
        timeout: 60000
      });

      const fileStream = require("fs").createWriteStream(downloadPath);
      response.data.pipe(fileStream);

      return new Promise((resolve) => {
        fileStream.on("finish", async () => {
          try {
            if (process.platform !== "win32") {
              await fsPromises.chmod(downloadPath, 0o755);
            }

            console.log(`[IPC] Successfully downloaded ${tool.name} to ${downloadPath}`);
            resolve({
              success: true,
              path: downloadPath,
              message: `${tool.name} downloaded successfully`
            });
          } catch (error) {
            resolve({
              success: false,
              error: `Failed to set permissions: ${error.message}`
            });
          }
        });

        fileStream.on("error", (error) => {
          resolve({
            success: false,
            error: `Download failed: ${error.message}`
          });
        });
      });
    } catch (error) {
      console.error(`[IPC] Error downloading ${tool.name}:`, error);
      return {
        success: false,
        error: error.message || "Download failed"
      };
    }
  });

  ipcMain.handle("getToolsConfig", async () => {
    return {
      tools: MEDIA_TOOLS_CONFIG,
      toolsPath: getMiteiruToolsPath()
    };
  });
}
