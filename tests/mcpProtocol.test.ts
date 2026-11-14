import assert from "node:assert/strict";
import {test} from "node:test";
import {handleMcpBody, mcpDefinitions, ToolError, type ToolCall, validateToolArguments} from "../main/mcp/protocol";

const VERSION = "8.2.0";

const calls: Array<[string, Record<string, unknown>]> = [];
const echo: ToolCall = async (name, args) => {
  calls.push([name, args]);
  return {echoed: name, args};
};

const send = (message: unknown, callTool: ToolCall = echo) => handleMcpBody(JSON.stringify(message), callTool, VERSION);

const toolError = (status: number, message?: string) => (error: unknown) => {
  assert.ok(error instanceof ToolError, "expected a ToolError");
  assert.equal(error.status, status);
  if (message !== undefined) assert.equal(error.message, message);
  return true;
};

test("a body that is not JSON is a parse error", async () => {
  const response = await handleMcpBody("{not json", echo, VERSION);
  assert.equal(response.status, 400);
  assert.deepEqual(response.value, {jsonrpc: "2.0", id: null, error: {code: -32700, message: "Parse error"}});
});

test("initialize answers with the client's protocol version when it is supported", async () => {
  const response = await send({jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-06-18"}});
  assert.equal(response.status, 200);
  assert.deepEqual(response.value, {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-06-18",
      capabilities: {tools: {listChanged: false}},
      serverInfo: {name: "miteiru", title: "Miteiru", version: VERSION},
      instructions: mcpDefinitions.instructions
    }
  });
});

test("initialize falls back to the newest version for one it does not know", async () => {
  const unknown = await send({jsonrpc: "2.0", id: "a", method: "initialize", params: {protocolVersion: "1999-01-01"}});
  assert.equal((unknown.value as any).result.protocolVersion, mcpDefinitions.protocolVersions[0]);
  const missing = await send({jsonrpc: "2.0", id: "b", method: "initialize"});
  assert.equal((missing.value as any).result.protocolVersion, mcpDefinitions.protocolVersions[0]);
  assert.equal((missing.value as any).id, "b");
});

test("ping answers with an empty result", async () => {
  const response = await send({jsonrpc: "2.0", id: 7, method: "ping"});
  assert.deepEqual(response.value, {jsonrpc: "2.0", id: 7, result: {}});
});

test("tools/list returns the definitions' tools", async () => {
  const response = await send({jsonrpc: "2.0", id: 2, method: "tools/list"});
  assert.equal(response.status, 200);
  assert.deepEqual((response.value as any).result, {tools: mcpDefinitions.tools});
});

test("a notification or a response gets 202 and an empty body, and runs nothing", async () => {
  calls.length = 0;
  const notification = await send({jsonrpc: "2.0", method: "notifications/initialized"});
  assert.deepEqual(notification, {status: 202, value: undefined});
  const callWithoutId = await send({jsonrpc: "2.0", method: "tools/call", params: {name: "get_status"}});
  assert.deepEqual(callWithoutId, {status: 202, value: undefined});
  const reply = await send({jsonrpc: "2.0", id: 3, result: {}});
  assert.deepEqual(reply, {status: 202, value: undefined});
  assert.equal(calls.length, 0);
});

test("a batch answers each request, leaves out notifications, and is 202 when nothing needs an answer", async () => {
  const batch = await send([
    {jsonrpc: "2.0", id: 1, method: "ping"},
    {jsonrpc: "2.0", method: "notifications/initialized"},
    {jsonrpc: "2.0", id: 2, method: "nope"}
  ]);
  assert.equal(batch.status, 200);
  assert.deepEqual(batch.value, [
    {jsonrpc: "2.0", id: 1, result: {}},
    {jsonrpc: "2.0", id: 2, error: {code: -32601, message: "Method not found: nope"}}
  ]);

  const quiet = await send([{jsonrpc: "2.0", method: "notifications/initialized"}, {jsonrpc: "2.0", id: 9, result: {}}]);
  assert.deepEqual(quiet, {status: 202, value: undefined});
});

test("a batch runs its tool calls one at a time", async () => {
  let running = 0;
  let most = 0;
  const slow: ToolCall = async () => {
    most = Math.max(most, ++running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return {};
  };
  const call = (id: number) => ({jsonrpc: "2.0", id, method: "tools/call", params: {name: "get_status"}});
  const batch = await send([call(1), call(2), call(3)], slow);
  assert.equal((batch.value as unknown[]).length, 3);
  assert.equal(most, 1);
});

test("an empty batch, or one of more than 10 messages, is refused before anything runs", async () => {
  calls.length = 0;
  const ping = (id: number) => ({jsonrpc: "2.0", id, method: "tools/call", params: {name: "get_status"}});
  for (const batch of [[], Array.from({length: 11}, (_, index) => ping(index))]) {
    const response = await send(batch);
    assert.equal(response.status, 400);
    assert.deepEqual(response.value, {jsonrpc: "2.0", id: null, error: {code: -32600, message: "A batch must hold 1 to 10 messages."}});
  }
  assert.equal(calls.length, 0);
});

test("an unknown method is -32601", async () => {
  const response = await send({jsonrpc: "2.0", id: 4, method: "resources/list"});
  assert.equal(response.status, 200);
  assert.deepEqual(response.value, {jsonrpc: "2.0", id: 4, error: {code: -32601, message: "Method not found: resources/list"}});
});

test("tools/call with an unknown tool is a protocol error, -32602", async () => {
  const response = await send({jsonrpc: "2.0", id: 5, method: "tools/call", params: {name: "delete_everything", arguments: {}}});
  assert.deepEqual(response.value, {jsonrpc: "2.0", id: 5, error: {code: -32602, message: "Unknown tool: delete_everything"}});
});

test("tools/call with invalid arguments is a tool error the model can read, and the tool does not run", async () => {
  calls.length = 0;
  const response = await send({jsonrpc: "2.0", id: 6, method: "tools/call", params: {name: "rate_video", arguments: {}}});
  assert.equal(response.status, 200);
  assert.deepEqual(response.value, {
    jsonrpc: "2.0",
    id: 6,
    result: {content: [{type: "text", text: "Missing argument: video"}], isError: true}
  });
  assert.equal(calls.length, 0);
});

test("tools/call turns a thrown error, ToolError or not, into a tool error", async () => {
  const toolFailure = await send(
    {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "get_status"}},
    async () => { throw new ToolError("No language is chosen", 409); }
  );
  assert.deepEqual((toolFailure.value as any).result, {content: [{type: "text", text: "No language is chosen"}], isError: true});

  const crash = await send(
    {jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "get_status"}},
    async () => { throw new Error("boom"); }
  );
  assert.deepEqual((crash.value as any).result, {content: [{type: "text", text: "boom"}], isError: true});
});

test("tools/call success carries the result as text and as structured content, with defaults filled in", async () => {
  calls.length = 0;
  const response = await send({jsonrpc: "2.0", id: 8, method: "tools/call", params: {name: "list_saved_words", arguments: {level: "known"}}});
  const expected = {echoed: "list_saved_words", args: {level: "known", limit: 100}};
  assert.deepEqual(response.value, {
    jsonrpc: "2.0",
    id: 8,
    result: {content: [{type: "text", text: JSON.stringify(expected)}], structuredContent: expected}
  });
  assert.deepEqual(calls, [["list_saved_words", {level: "known", limit: 100}]]);
});

test("a message that is not an object is an invalid request", async () => {
  const response = await send(42);
  assert.deepEqual(response.value, {jsonrpc: "2.0", id: null, error: {code: -32600, message: "Invalid Request"}});
});

test("validateToolArguments fills defaults", () => {
  assert.deepEqual(validateToolArguments("search_videos", {query: "猫"}), {
    query: "猫",
    captions: "learning-language",
    duration: "any",
    limit: 5
  });
  assert.deepEqual(validateToolArguments("list_saved_words", {}), {level: "learning", limit: 100});
  assert.deepEqual(validateToolArguments("open_video", {video: "abc", start_at: 12.5}), {video: "abc", start_at: 12.5});
});

test("undefined, null and null options count as nothing given", () => {
  assert.deepEqual(validateToolArguments("get_status", undefined), {});
  assert.deepEqual(validateToolArguments("get_status", null), {});
  assert.deepEqual(validateToolArguments("open_video", {video: "abc", translation: null}), {video: "abc"});
});

test("validateToolArguments names the argument in short messages", () => {
  assert.throws(() => validateToolArguments("rate_video", {}), toolError(400, "Missing argument: video"));
  assert.throws(() => validateToolArguments("rate_video", {video: ""}), toolError(400, "video must not be empty"));
  assert.throws(() => validateToolArguments("rate_video", {video: 5}), toolError(400, "video must be a string"));
  assert.throws(() => validateToolArguments("get_status", {x: 1}), toolError(400, "Unknown argument: x"));
  assert.throws(() => validateToolArguments("get_status", []), toolError(400, "Arguments must be an object"));
  assert.throws(() => validateToolArguments("search_videos", {query: "a", captions: "none"}),
    toolError(400, "captions must be one of: learning-language, uploader, any"));
  assert.throws(() => validateToolArguments("open_video", {video: "a", start_at: -1}), toolError(400, "start_at must be a number, 0 or more"));
  assert.throws(() => validateToolArguments("open_video", {video: "a", start_at: "3"}), toolError(400, "start_at must be a number, 0 or more"));
});

test("an integer argument must be a whole number inside its range", () => {
  for (const limit of [0, 11, 2.5, "3", Number.NaN]) {
    assert.throws(() => validateToolArguments("search_videos", {query: "a", limit}), toolError(400, "limit must be an integer from 1 to 10"));
  }
  assert.equal(validateToolArguments("search_videos", {query: "a", limit: 1}).limit, 1);
  assert.equal(validateToolArguments("search_videos", {query: "a", limit: 10}).limit, 10);
  assert.throws(() => validateToolArguments("list_saved_words", {limit: 1001}), toolError(400, "limit must be an integer from 1 to 1000"));
});

test("string lengths count code points, not UTF-16 units", () => {
  assert.equal(validateToolArguments("search_videos", {query: "😀".repeat(200)}).query, "😀".repeat(200));
  assert.throws(() => validateToolArguments("search_videos", {query: "😀".repeat(201)}), toolError(400, "query must have at most 200 characters"));
});

test("validateToolArguments for a tool that does not exist is a 404", () => {
  assert.throws(() => validateToolArguments("nope", {}), toolError(404, "Unknown tool: nope"));
});

test("ToolError is a 400 unless it says otherwise", () => {
  assert.equal(new ToolError("x").status, 400);
  assert.equal(new ToolError("x", 502).status, 502);
});
