import assert from "node:assert/strict";
import {test} from "node:test";
import {generateUserNoteWithAI} from "../renderer/utils/generateUserNoteWithAI";

const params = (model: string) => ({term: "猫", lang: "ja", openRouterApiKey: "sk-test", openRouterModel: model});

// Fakes OpenRouter: each reply is {status, body}; the request bodies are collected.
const fakeFetch = (replies: Array<{status: number; body: unknown}>) => {
  const realFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const reply = replies[Math.min(bodies.length, replies.length) - 1];
    return new Response(JSON.stringify(reply.body), {status: reply.status, headers: {"Content-Type": "application/json"}});
  }) as typeof fetch;
  return {bodies, restore: () => { globalThis.fetch = realFetch; }};
};

const ok = {status: 200, body: {choices: [{message: {content: "{}"}}]}};

test("a word note asks for no thinking by default", async () => {
  const fake = fakeFetch([ok]);
  try {
    await generateUserNoteWithAI(params("test/note-default"));
    assert.deepEqual(fake.bodies[0].reasoning, {effort: "none", exclude: true});
  } finally {
    fake.restore();
  }
});

test("a model that must think is asked again without reasoning, and remembered", async () => {
  const refused = {status: 400, body: {error: {message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400}}};
  const fake = fakeFetch([refused, ok, ok]);
  try {
    await generateUserNoteWithAI(params("test/note-must-think"));
    assert.equal(fake.bodies.length, 2);
    assert.ok("reasoning" in fake.bodies[0]);
    assert.ok(!("reasoning" in fake.bodies[1]));
    await generateUserNoteWithAI(params("test/note-must-think"));
    assert.equal(fake.bodies.length, 3);
    assert.ok(!("reasoning" in fake.bodies[2]));
  } finally {
    fake.restore();
  }
});

test("a refused key gets the friendly message, other failures keep the status", async () => {
  let fake = fakeFetch([{status: 401, body: {error: {message: "No auth credentials found"}}}]);
  try {
    await assert.rejects(generateUserNoteWithAI(params("test/note-401")), /didn't accept your key/);
  } finally {
    fake.restore();
  }
  fake = fakeFetch([{status: 500, body: {}}]);
  try {
    await assert.rejects(generateUserNoteWithAI(params("test/note-500")), /API request failed: 500/);
  } finally {
    fake.restore();
  }
});
