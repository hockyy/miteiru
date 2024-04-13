/*
Reasonably Secure Electron
Copyright (C) 2021  Bishop Fox
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
-------------------------------------------------------------------------
Implementing a custom protocol achieves two goals:
  1) Allows us to use ES6 modules/targets for Angular
  2) Avoids running the app in a file:// origin
*/

import path from "path";
export const scheme = "miteiru";

const mimeTypes = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".map": "text/plain",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ts": "video/webm",
  ".mkv": "video/webm",
  ".srt": "text/plain",
  ".vtt": "text/plain"
};

function charset(mimeExt) {
  return [".html", ".htm", ".js", ".mjs"].some((m) => m === mimeExt) ?
      "utf-8" :
      null;
}

function mime(filename) {
  const mimeExt = path.extname(`${filename || ""}`).toLowerCase();
  const mimeType = mimeTypes[mimeExt];
  return mimeType ? {mimeExt, mimeType} : {mimeExt: null, mimeType: null};
}

export function requestHandler(req, next) {
  const reqUrl = new URL(req.url);
  let reqPath = decodeURI(reqUrl.pathname);
  if (reqPath === "/") {
    reqPath = "/index.html";
  }
  const reqFilename = path.basename(reqPath);
  const {mimeExt, mimeType} = mime(reqFilename);
  if (mimeType !== null) {
    next({
      mimeType,
      charset: charset(mimeExt),
      path: reqPath,
      stream: true
    });
  } else {
    console.error("File not found");
  }
}
