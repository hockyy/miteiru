import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {net, protocol} from "electron";
import {isInsideDirectory} from "./helpers/navigationGuard";

/**
 * app:// serves the exported Next.js renderer in production. Ported from electron-serve 3.0.1
 * (MIT, Sindre Sorhus); its privileges are registered together with miteiru:// because Electron
 * honours only one registerSchemesAsPrivileged call, and electron-serve's later call dropped the
 * miteiru:// privileges.
 */
export const APP_SCHEME_PRIVILEGES = {
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
    allowServiceWorkers: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    codeCache: true,
  },
};

const findFile = async (candidate: string): Promise<string | undefined> => {
  try {
    const stats = await fs.stat(candidate);
    if (stats.isFile()) return candidate;
    if (stats.isDirectory()) return findFile(path.join(candidate, "index.html"));
  } catch {
    // Missing; the caller decides between 404 and the index page.
  }
  return undefined;
};

/**
 * The file for an app:// URL: the file itself, a folder's index.html (app://./home → home/index.html),
 * or the root index.html for unknown pages. Missing assets and paths outside `directory` are null.
 */
export const resolveAppFile = async (directory: string, requestUrl: string): Promise<string | null> => {
  let filePath: string;
  try {
    filePath = path.join(directory, decodeURIComponent(new URL(requestUrl).pathname));
  } catch {
    return null;
  }
  if (!isInsideDirectory(directory, filePath)) return null;

  const found = await findFile(filePath);
  if (found) return found;
  const extension = path.extname(filePath);
  if (extension && extension !== ".html" && extension !== ".asar") return null;
  return path.join(directory, "index.html");
};

/** Serves `directory` (the exported renderer) on app://. Call after the app is ready. */
export const setupAppProtocol = (directory: string) => {
  protocol.handle("app", async (request) => {
    const filePath = await resolveAppFile(directory, request.url);
    if (!filePath) return new Response(null, {status: 404, statusText: "Not Found"});

    const response = await net.fetch(pathToFileURL(filePath).toString());
    // DevTools only loads source maps served as JSON.
    if (filePath.endsWith(".map")) {
      return new Response(await response.arrayBuffer(), {
        status: response.status,
        statusText: response.statusText,
        headers: {...Object.fromEntries(response.headers.entries()), "content-type": "application/json"},
      });
    }
    return response;
  });
};

/*
 * The resolveAppFile / setupAppProtocol logic is adapted from electron-serve 3.0.1:
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
