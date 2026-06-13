import crypto from "crypto";
import fs from "node:fs/promises";
import http, {IncomingMessage, Server, ServerResponse} from "node:http";
import path from "path";
import {languagePlugins, getLanguagePluginByTokenizerMode} from "./registry";
import {analyzeText} from "./analyzer";

export interface AnalyzerServerRegistration {
  host: string;
  port: number;
  token: string;
  pid: number;
  startedAt: number;
  version: string;
}

export interface AnalyzerServerContext {
  appDataDirectory: string;
  version: string;
  getTokenizer: () => string;
  getToneType: () => Promise<string>;
  analyze?: typeof analyzeText;
}

export interface AnalyzerServerHandle {
  server: Server;
  registration: AnalyzerServerRegistration;
  registrationPath: string;
  close: () => Promise<void>;
}

const host = "127.0.0.1";
const registrationFilename = "analyzer-server.json";
const tokenHeader = "x-miteiru-analyzer-token";

export const getAnalyzerServerRegistrationPath = (appDataDirectory: string) => (
  path.join(appDataDirectory, registrationFilename)
);

const sendJson = (res: ServerResponse, statusCode: number, value: unknown) => {
  const body = JSON.stringify(value);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
};

const readJsonBody = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
};

const getActiveLanguage = (tokenizerMode: string) => {
  const plugin = getLanguagePluginByTokenizerMode(tokenizerMode);
  return {
    tokenizerMode,
    languageCode: plugin?.languageCode ?? "",
    pluginId: plugin?.id ?? "",
    name: plugin?.name ?? ""
  };
};

const healthResponse = (context: AnalyzerServerContext, registration: AnalyzerServerRegistration) => {
  const active = getActiveLanguage(context.getTokenizer());
  return {
    ok: true,
    version: context.version,
    server: {
      host: registration.host,
      port: registration.port,
      pid: registration.pid,
      startedAt: registration.startedAt
    },
    active,
    supportedPlugins: languagePlugins
      .filter((plugin) => plugin.kind === "language")
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        tokenizerMode: plugin.tokenizerMode,
        languageCode: plugin.languageCode
      }))
  };
};

const assertToken = (req: IncomingMessage, token: string) => {
  const provided = req.headers[tokenHeader];
  return provided === token;
};

const handleAnalyze = async (
  req: IncomingMessage,
  res: ServerResponse,
  context: AnalyzerServerContext,
  batch: boolean
) => {
  type AnalyzeBody = {
    text?: string;
    texts?: string[];
    lang?: string;
    tokenizer?: string;
  };

  const body = await readJsonBody<AnalyzeBody>(req);
  const tokenizerMode = context.getTokenizer();
  const active = getActiveLanguage(tokenizerMode);

  if (!tokenizerMode) {
    sendJson(res, 409, {
      ok: false,
      error: "No analyzer language is selected in Miteiru."
    });
    return;
  }

  if (body.lang && body.lang !== active.languageCode) {
    sendJson(res, 409, {
      ok: false,
      error: `Requested language ${body.lang} does not match active language ${active.languageCode}.`,
      active
    });
    return;
  }

  if (body.tokenizer && body.tokenizer !== active.tokenizerMode) {
    sendJson(res, 409, {
      ok: false,
      error: `Requested tokenizer ${body.tokenizer} does not match active tokenizer ${active.tokenizerMode}.`,
      active
    });
    return;
  }

  const toneType = await context.getToneType();

  if (batch) {
    if (!Array.isArray(body.texts)) {
      sendJson(res, 400, {ok: false, error: "Expected JSON body with texts array."});
      return;
    }

    const analyzer = context.analyze ?? analyzeText;
    const results = await Promise.all(body.texts.map((text) => analyzer(text, {
      tokenizerMode,
      toneType
    })));
    sendJson(res, 200, {ok: true, active, results});
    return;
  }

  if (typeof body.text !== "string") {
    sendJson(res, 400, {ok: false, error: "Expected JSON body with text string."});
    return;
  }

  const analyzer = context.analyze ?? analyzeText;
  const tokens = await analyzer(body.text, {
    tokenizerMode,
    toneType
  });
  sendJson(res, 200, {ok: true, active, tokens});
};

const routeRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  context: AnalyzerServerContext,
  registration: AnalyzerServerRegistration
) => {
  const url = new URL(req.url ?? "/", `http://${host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, healthResponse(context, registration));
    return;
  }

  if (!assertToken(req, registration.token)) {
    sendJson(res, 401, {ok: false, error: "Unauthorized"});
    return;
  }

  if (req.method === "POST" && url.pathname === "/analyze") {
    await handleAnalyze(req, res, context, false);
    return;
  }

  if (req.method === "POST" && url.pathname === "/analyze-batch") {
    await handleAnalyze(req, res, context, true);
    return;
  }

  sendJson(res, 404, {ok: false, error: "Not found"});
};

const listen = (server: Server) => new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, host, () => {
    server.off("error", reject);
    const address = server.address();
    if (!address || typeof address === "string") {
      reject(new Error("Analyzer server did not return a TCP address."));
      return;
    }
    resolve(address.port);
  });
});

export const startAnalyzerServer = async (
  context: AnalyzerServerContext
): Promise<AnalyzerServerHandle> => {
  const token = crypto.randomBytes(32).toString("hex");
  let registration: AnalyzerServerRegistration;

  const server = http.createServer((req, res) => {
    routeRequest(req, res, context, registration).catch((error) => {
      console.error("[AnalyzerServer]", error);
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected analyzer server error."
      });
    });
  });

  const port = await listen(server);
  registration = {
    host,
    port,
    token,
    pid: process.pid,
    startedAt: Date.now(),
    version: context.version
  };

  const registrationPath = getAnalyzerServerRegistrationPath(context.appDataDirectory);
  await fs.writeFile(registrationPath, `${JSON.stringify(registration, null, 2)}\n`, "utf8");

  return {
    server,
    registration,
    registrationPath,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    })
  };
};
