import crypto from "crypto";
import fs from "node:fs/promises";
import path from "path";
import {languagePlugins, getLanguagePluginByTokenizerMode} from "./registry";
import {analyzeText} from "./analyzer";

/**
 * The local analyzer API (docs/ANALYZER_SERVER.md). This module answers requests; a transport owns
 * the socket: the Tauri shell's Rust listener in the app (src-tauri/src/analyzer.rs), node:http in
 * the tests.
 */

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
  pid: number;
  getTokenizer: () => string;
  getToneType: () => Promise<string>;
  analyze?: typeof analyzeText;
}

export interface AnalyzerRequest {
  method: string;
  /** Path and query, e.g. `/analyze`. */
  path: string;
  /** The `X-Miteiru-Analyzer-Token` header, if sent. */
  token?: string;
  body: string;
}

export interface AnalyzerResponse {
  status: number;
  value: unknown;
}

/** Listens on 127.0.0.1 (port 0), hands each request to `handle`, and reports the port it got. */
export type AnalyzerTransport = (
  handle: (request: AnalyzerRequest) => Promise<AnalyzerResponse>
) => Promise<{ port: number; close: () => Promise<void> }>;

export interface AnalyzerServerHandle {
  registration: AnalyzerServerRegistration;
  registrationPath: string;
  close: () => Promise<void>;
}

export const ANALYZER_HOST = "127.0.0.1";
export const ANALYZER_TOKEN_HEADER = "x-miteiru-analyzer-token";
const registrationFilename = "analyzer-server.json";

export const getAnalyzerServerRegistrationPath = (appDataDirectory: string) => (
  path.join(appDataDirectory, registrationFilename)
);

const json = (status: number, value: unknown): AnalyzerResponse => ({status, value});

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

const handleAnalyze = async (
  bodyText: string,
  context: AnalyzerServerContext,
  batch: boolean
): Promise<AnalyzerResponse> => {
  type AnalyzeBody = {
    text?: string;
    texts?: string[];
    lang?: string;
    tokenizer?: string;
  };
  let body: AnalyzeBody;
  try {
    body = bodyText.trim() ? JSON.parse(bodyText) as AnalyzeBody : {};
  } catch {
    return json(400, {ok: false, error: "Expected a JSON body."});
  }
  const tokenizerMode = context.getTokenizer();
  const active = getActiveLanguage(tokenizerMode);

  if (!tokenizerMode) {
    return json(409, {ok: false, error: "No analyzer language is selected in Miteiru."});
  }

  if (body.lang && body.lang !== active.languageCode) {
    return json(409, {
      ok: false,
      error: `Requested language ${body.lang} does not match active language ${active.languageCode}.`,
      active
    });
  }

  // MeCab was removed; clients that still ask for it get Kuromoji, which uses the same dictionary.
  const requestedTokenizer = body.tokenizer === "mecab" ? "kuromoji" : body.tokenizer;
  if (requestedTokenizer && requestedTokenizer !== active.tokenizerMode) {
    return json(409, {
      ok: false,
      error: `Requested tokenizer ${body.tokenizer} does not match active tokenizer ${active.tokenizerMode}.`,
      active
    });
  }

  const toneType = await context.getToneType();
  const analyzer = context.analyze ?? analyzeText;
  if (batch) {
    if (!Array.isArray(body.texts)) {
      return json(400, {ok: false, error: "Expected JSON body with texts array."});
    }
    const results = await Promise.all(body.texts.map((text) => analyzer(text, {tokenizerMode, toneType})));
    return json(200, {ok: true, active, results});
  }

  if (typeof body.text !== "string") {
    return json(400, {ok: false, error: "Expected JSON body with text string."});
  }
  const tokens = await analyzer(body.text, {tokenizerMode, toneType});
  return json(200, {ok: true, active, tokens});
};

/** One request of the analyzer API. Never throws: failures become a 500 JSON response. */
export const handleAnalyzerRequest = async (
  request: AnalyzerRequest,
  context: AnalyzerServerContext,
  registration: AnalyzerServerRegistration
): Promise<AnalyzerResponse> => {
  try {
    const url = new URL(request.path || "/", `http://${ANALYZER_HOST}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, healthResponse(context, registration));
    }
    if (request.token !== registration.token) {
      return json(401, {ok: false, error: "Unauthorized"});
    }
    if (request.method === "POST" && url.pathname === "/analyze") {
      return await handleAnalyze(request.body, context, false);
    }
    if (request.method === "POST" && url.pathname === "/analyze-batch") {
      return await handleAnalyze(request.body, context, true);
    }
    return json(404, {ok: false, error: "Not found"});
  } catch (error) {
    console.error("[AnalyzerServer]", error);
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected analyzer server error."
    });
  }
};

/** Starts the API on `transport` and writes analyzer-server.json for clients to find it. */
export const startAnalyzerServer = async (
  context: AnalyzerServerContext,
  transport: AnalyzerTransport
): Promise<AnalyzerServerHandle> => {
  const token = crypto.randomBytes(32).toString("hex");
  let registration: AnalyzerServerRegistration | undefined;

  const {port, close} = await transport(async (request) => {
    if (!registration) return json(503, {ok: false, error: "Analyzer server is starting."});
    return handleAnalyzerRequest(request, context, registration);
  });
  registration = {
    host: ANALYZER_HOST,
    port,
    token,
    pid: context.pid,
    startedAt: Date.now(),
    version: context.version
  };

  const registrationPath = getAnalyzerServerRegistrationPath(context.appDataDirectory);
  await fs.writeFile(registrationPath, `${JSON.stringify(registration, null, 2)}\n`, "utf8");

  return {registration, registrationPath, close};
};
