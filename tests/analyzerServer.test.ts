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

const handles: AnalyzerServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

const createServer = async (overrides: Partial<Parameters<typeof startAnalyzerServer>[0]> = {}) => {
  const appDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-analyzer-test-"));
  const handle = await startAnalyzerServer({
    appDataDirectory,
    version: "test-version",
    getTokenizer: () => "jieba",
    getToneType: async () => "num",
    analyze: async (text, options) => ([{
      origin: text,
      tokenizerMode: options.tokenizerMode,
      toneType: options.toneType,
      separation: [{main: text}]
    }]),
    ...overrides
  });
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
