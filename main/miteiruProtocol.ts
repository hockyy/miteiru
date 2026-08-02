import fs from "node:fs";
import path from "node:path";
import {Readable} from "node:stream";
import {protocol} from "electron";

const mimeTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".ogg": "video/ogg",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ts": "video/mp2t",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const mimeForPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] ?? "application/octet-stream";
};

export const parseRangeHeader = (rangeHeader: string, fileSize: number) => {
  const trimmed = rangeHeader.trim();

  const suffixMatch = /^bytes=-(\d+)$/i.exec(trimmed);
  if (suffixMatch) {
    const length = Number(suffixMatch[1]);
    if (!Number.isFinite(length) || length <= 0) return null;
    const start = Math.max(fileSize - length, 0);
    return {start, end: fileSize - 1};
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) return null;

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : fileSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) {
    return null;
  }

  end = Math.min(end, fileSize - 1);
  return {start, end};
};

/**
 * Resolve a miteiru:// request URL to a local filesystem path.
 * Handles encoded Windows drive letters (C%3A) and Chromium's host mangling (miteiru://C/Users/...).
 */
export const resolveMiteiruFilePath = (rawUrl: string) => {
  const parsed = new URL(rawUrl);
  let filePath: string;

  if (parsed.hostname && /^[A-Za-z]$/.test(parsed.hostname)) {
    // miteiru://C/Users/... — drive letter was parsed as hostname
    filePath = `${parsed.hostname}:${parsed.pathname}`;
  } else {
    filePath = parsed.pathname;
  }

  filePath = decodeURIComponent(filePath);

  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  }

  if (process.platform === "win32" && /^[A-Za-z]\//.test(filePath) && filePath[1] !== ":") {
    filePath = `${filePath[0]}:${filePath.slice(1)}`;
  }

  return path.normalize(filePath);
};

const buildResponseHeaders = (filePath: string, fileSize: number) => ({
  "accept-ranges": "bytes",
  "access-control-allow-origin": "*",
  "content-type": mimeForPath(filePath),
  "content-length": String(fileSize),
});

export const createMiteiruFileResponse = (filePath: string, request: Request) => {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as BodyInit, {
      status: 200,
      headers: buildResponseHeaders(filePath, fileSize),
    });
  }

  const range = parseRangeHeader(rangeHeader, fileSize);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
        "content-range": `bytes */${fileSize}`,
        "content-type": mimeForPath(filePath),
      },
    });
  }

  const {start, end} = range;
  const contentLength = end - start + 1;

  return new Response(
    Readable.toWeb(fs.createReadStream(filePath, {start, end})) as BodyInit,
    {
      status: 206,
      headers: {
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
        "content-length": String(contentLength),
        "content-range": `bytes ${start}-${end}/${fileSize}`,
        "content-type": mimeForPath(filePath),
      },
    },
  );
};

export const registerMiteiruScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "miteiru",
      privileges: {
        bypassCSP: true,
        corsEnabled: true,
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ]);
};

export const setupMiteiruProtocol = () => {
  protocol.handle("miteiru", async (request) => {
    try {
      const resolved = resolveMiteiruFilePath(request.url);
      const exists = fs.existsSync(resolved);
      const range = request.headers.get("range");

      console.log("[miteiru-protocol]", {
        rawUrl: request.url,
        resolved,
        exists,
        range,
      });

      if (!exists) {
        console.error("[miteiru-protocol] FILE_NOT_FOUND", resolved);
        return new Response("Not Found", {status: 404});
      }

      const response = createMiteiruFileResponse(resolved, request);
      console.log("[miteiru-protocol] response", {
        resolved,
        status: response.status,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        contentRange: response.headers.get("content-range"),
      });

      return response;
    } catch (error) {
      console.error("[miteiru-protocol] error", error);
      return new Response("Error", {status: 500});
    }
  });
};
