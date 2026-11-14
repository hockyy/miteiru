import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, test} from "node:test";
import {
  AnalyzerServerHandle,
  getAnalyzerServerRegistrationPath,
  startAnalyzerServer
} from "../main/handler/languages/analyzerServer";
import {mcpDefinitions, ToolError, type ToolCall} from "../main/mcp/protocol";
import {nodeHttpTransport} from "./helpers/analyzerHttpTransport";

const handles: AnalyzerServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

const createServer = async (overrides: Partial<Parameters<typeof startAnalyzerServer>[0]> = {}) => {
  const appDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-analyzer-test-"));
  const handle = await startAnalyzerServer({
    appDataDirectory,
    version: "test-version",
    pid: process.pid,
    getTokenizer: () => "jieba",
    getToneType: async () => "num",
    analyze: async (text, options) => ([{
      origin: text,
      tokenizerMode: options.tokenizerMode,
      toneType: options.toneType,
      separation: [{main: text}]
    }]),
    ...overrides
  }, nodeHttpTransport);
  handles.push(handle);
  return handle;
};

const requestJson = async (
  handle: AnalyzerServerHandle,
  pathname: string,
  body?: unknown,
  token = handle.registration.token
) => {
  const response = await fetch(`http://${handle.registration.host}:${handle.registration.port}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-miteiru-analyzer-token": token
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
};

test("startAnalyzerServer writes registration with dynamic localhost port", async () => {
  const appDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-analyzer-test-"));
  const handle = await createServer({appDataDirectory});

  assert.equal(handle.registration.host, "127.0.0.1");
  assert.ok(handle.registration.port > 0);
  assert.equal(handle.registrationPath, getAnalyzerServerRegistrationPath(appDataDirectory));

  const registration = JSON.parse(await fs.readFile(handle.registrationPath, "utf8"));
  assert.equal(registration.port, handle.registration.port);
  assert.equal(registration.token, handle.registration.token);
});

test("the registration file, which holds the token, can be read by this user only", {skip: process.platform === "win32"}, async () => {
  const handle = await createServer();
  assert.equal((await fs.stat(handle.registrationPath)).mode & 0o777, 0o600);
});

test("health exposes the current desktop tokenizer and supported plugins", async () => {
  const handle = await createServer();
  const response = await requestJson(handle, "/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.active.tokenizerMode, "jieba");
  assert.equal(response.body.active.languageCode, "zh-CN");
  assert.ok(response.body.supportedPlugins.some((plugin) => plugin.id === "mandarin-jieba"));
});

test("analyze uses the selected desktop tokenizer regardless of request language control", async () => {
  const handle = await createServer();
  const response = await requestJson(handle, "/analyze", {text: "我"});

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.active.tokenizerMode, "jieba");
  assert.deepEqual(response.body.tokens, [{
    origin: "我",
    tokenizerMode: "jieba",
    toneType: "num",
    separation: [{main: "我"}]
  }]);
});

test("analyze rejects mismatched optional language assertions", async () => {
  const handle = await createServer();
  const response = await requestJson(handle, "/analyze", {text: "我", lang: "ja"});

  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /does not match active language/);
});

test("a client still asking for the removed MeCab tokenizer is served by Kuromoji", async () => {
  const handle = await createServer({getTokenizer: () => "kuromoji"});
  const response = await requestJson(handle, "/analyze", {text: "見た", tokenizer: "mecab"});

  assert.equal(response.status, 200);
  assert.equal(response.body.tokens[0].tokenizerMode, "kuromoji");
});

test("analyze-batch returns one result per input", async () => {
  const handle = await createServer();
  const response = await requestJson(handle, "/analyze-batch", {texts: ["我", "你"]});

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.results.length, 2);
  assert.equal(response.body.results[0][0].origin, "我");
  assert.equal(response.body.results[1][0].origin, "你");
});

test("protected endpoints require the registration token", async () => {
  const handle = await createServer();
  const response = await requestJson(handle, "/analyze", {text: "我"}, "wrong-token");

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

test("analyze reports when no desktop language is selected", async () => {
  const handle = await createServer({getTokenizer: () => ""});
  const response = await requestJson(handle, "/analyze", {text: "我"});

  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /No analyzer language is selected/);
});

/** The raw answer: an MCP notification has an empty body, which is not JSON. */
const requestRaw = async (
  handle: AnalyzerServerHandle,
  pathname: string,
  init: {method?: string; body?: string; token?: string | null} = {}
) => {
  const headers: Record<string, string> = {"content-type": "application/json"};
  if (init.token !== null) headers["x-miteiru-analyzer-token"] = init.token ?? handle.registration.token;
  const response = await fetch(`http://${handle.registration.host}:${handle.registration.port}${pathname}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body
  });
  const text = await response.text();
  return {status: response.status, text, json: () => JSON.parse(text)};
};

const calls: Array<[string, Record<string, unknown>]> = [];
const callTool: ToolCall = async (name, args) => {
  calls.push([name, args]);
  if (args.video === "private") throw new ToolError("This video is private", 502);
  if (args.video === "boom") throw new Error("Something broke");
  return {name, args};
};

const initialize = JSON.stringify({jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-11-25"}});

test("POST /mcp answers an MCP message with the token", async () => {
  const handle = await createServer({callTool});
  const response = await requestRaw(handle, "/mcp", {body: initialize});

  assert.equal(response.status, 200);
  const {result} = response.json();
  assert.equal(result.protocolVersion, "2025-11-25");
  assert.equal(result.serverInfo.version, "test-version");
  assert.equal(result.serverInfo.name, "miteiru");
});

test("POST /mcp without the token is unauthorized", async () => {
  const handle = await createServer({callTool});
  const missing = await requestRaw(handle, "/mcp", {body: initialize, token: null});
  const wrong = await requestRaw(handle, "/mcp", {body: initialize, token: "wrong-token"});

  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(missing.json().ok, false);
});

test("an MCP notification gets 202 and an empty body", async () => {
  const handle = await createServer({callTool});
  const response = await requestRaw(handle, "/mcp", {body: JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"})});

  assert.equal(response.status, 202);
  assert.equal(response.text, "");
});

test("an MCP tool call runs the tool with validated arguments", async () => {
  calls.length = 0;
  const handle = await createServer({callTool});
  const response = await requestRaw(handle, "/mcp", {
    body: JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "list_saved_words", arguments: {}}})
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.json().result.structuredContent, {name: "list_saved_words", args: {level: "learning", limit: 100}});
  assert.deepEqual(calls, [["list_saved_words", {level: "learning", limit: 100}]]);
});

test("GET /mcp says to send MCP messages with POST", async () => {
  const handle = await createServer({callTool});
  const response = await requestRaw(handle, "/mcp");

  assert.equal(response.status, 405);
  assert.deepEqual(response.json(), {ok: false, error: "Send MCP messages with POST."});
});

test("GET /tools lists the tools", async () => {
  const handle = await createServer({callTool});
  const response = await requestJson(handle, "/tools");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.tools.map((tool) => tool.name), mcpDefinitions.tools.map((tool) => tool.name));
  assert.deepEqual(response.body.tools, mcpDefinitions.tools);
});

test("GET /tools needs the token", async () => {
  const handle = await createServer({callTool});
  const response = await requestJson(handle, "/tools", undefined, "wrong-token");

  assert.equal(response.status, 401);
});

test("POST /tools/<name> runs the tool and returns its result", async () => {
  calls.length = 0;
  const handle = await createServer({callTool});
  const response = await requestJson(handle, "/tools/get_status", {});

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {ok: true, result: {name: "get_status", args: {}}});
  assert.deepEqual(calls, [["get_status", {}]]);
});

test("POST /tools/<name> fills in defaults and accepts an empty body", async () => {
  calls.length = 0;
  const handle = await createServer({callTool});
  const search = await requestJson(handle, "/tools/search_videos", {query: "猫"});
  assert.deepEqual(search.body.result.args, {query: "猫", captions: "learning-language", duration: "any", limit: 5});

  const status = await requestRaw(handle, "/tools/get_status", {method: "POST", body: ""});
  assert.equal(status.status, 200);
});

test("POST /tools/<name> for an unknown tool is 404", async () => {
  calls.length = 0;
  const handle = await createServer({callTool});
  const response = await requestJson(handle, "/tools/delete_everything", {});

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {ok: false, error: "Unknown tool: delete_everything"});
  assert.equal(calls.length, 0);
});

test("POST /tools/<name> with bad arguments or a body that is not JSON is 400", async () => {
  calls.length = 0;
  const handle = await createServer({callTool});
  const missing = await requestJson(handle, "/tools/rate_video", {});
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body, {ok: false, error: "Missing argument: video"});

  const unknown = await requestJson(handle, "/tools/get_status", {extra: true});
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, "Unknown argument: extra");

  const notJson = await requestRaw(handle, "/tools/get_status", {body: "{nope"});
  assert.equal(notJson.status, 400);
  assert.deepEqual(notJson.json(), {ok: false, error: "Expected a JSON body."});
  assert.equal(calls.length, 0);
});

test("POST /tools/<name> gives a ToolError its own status and any other error 500", async () => {
  const handle = await createServer({callTool});
  const toolFailure = await requestJson(handle, "/tools/rate_video", {video: "private"});
  assert.equal(toolFailure.status, 502);
  assert.deepEqual(toolFailure.body, {ok: false, error: "This video is private"});

  const crash = await requestJson(handle, "/tools/rate_video", {video: "boom"});
  assert.equal(crash.status, 500);
  assert.deepEqual(crash.body, {ok: false, error: "Something broke"});
});

test("the MCP and tool routes answer 503 when Miteiru has no tools to run", async () => {
  const handle = await createServer();
  const mcp = await requestRaw(handle, "/mcp", {body: initialize});
  const tools = await requestRaw(handle, "/tools");
  const tool = await requestRaw(handle, "/tools/get_status", {body: "{}"});

  assert.deepEqual([mcp.status, tools.status, tool.status], [503, 503, 503]);
});

test("health still answers without a token, and other paths are still not found", async () => {
  const handle = await createServer({callTool});
  const health = await requestRaw(handle, "/health", {token: null});
  assert.equal(health.status, 200);

  const missing = await requestRaw(handle, "/tools/");
  assert.equal(missing.status, 404);
  const other = await requestRaw(handle, "/nope");
  assert.equal(other.status, 404);
});

