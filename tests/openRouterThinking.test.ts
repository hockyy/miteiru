import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {openRouterChatCompletion} from "../main/helpers/openRouterHttp";
import {reasoningForThinking, refusesAnswerWithoutThinking} from "../renderer/utils/openRouterConstants";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers like OpenRouter; `refuse(body)` turns a request into the 400 a must-think model gives. */
const fakeOpenRouter = (refuse: (body: Record<string, unknown>) => boolean = () => false) => {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    if (refuse(body)) {
      return new Response(JSON.stringify({error: {message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400}}), {status: 400});
    }
    return new Response(JSON.stringify({choices: [{message: {content: "1. Hello"}}]}), {status: 200});
  }) as typeof fetch;
  return bodies;
};

const ask = (model: string, thinking?: unknown) => openRouterChatCompletion({
  apiKey: "sk-test",
  model,
  thinking,
  messages: [{role: "user", content: "1. こんにちは"}],
});

test("thinking is off unless the learner leaves it to the model", () => {
  assert.deepEqual(reasoningForThinking(undefined), {effort: "none", exclude: true});
  assert.deepEqual(reasoningForThinking("off"), {effort: "none", exclude: true});
  assert.equal(reasoningForThinking("model"), undefined);
});

test("only a 400 about reasoning counts as a refusal to answer without thinking", () => {
  assert.equal(refusesAnswerWithoutThinking(400, "OpenRouter 400: Reasoning is mandatory for this endpoint and cannot be disabled."), true);
  assert.equal(refusesAnswerWithoutThinking(400, "OpenRouter 400: context length exceeded"), false);
  assert.equal(refusesAnswerWithoutThinking(500, "reasoning server error"), false);
});

test("a chat request asks for no thinking by default, and not when the learner turned it on", async () => {
  const bodies = fakeOpenRouter();
  await ask("test/plain-a");
  await ask("test/plain-a", "model");
  assert.deepEqual(bodies[0].reasoning, {effort: "none", exclude: true});
  assert.equal("reasoning" in bodies[1], false);
});

test("a model that must think is asked again without the setting, and not offered it again", async () => {
  const bodies = fakeOpenRouter((body) => "reasoning" in body);
  const first = await ask("test/must-think");
  assert.equal(first.content, "1. Hello");
  assert.equal(bodies.length, 2);
  assert.ok("reasoning" in bodies[0]);
  assert.equal("reasoning" in bodies[1], false);
  await ask("test/must-think");
  assert.equal(bodies.length, 3);
  assert.equal("reasoning" in bodies[2], false);
});

test("other refusals are not retried", async () => {
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response("{\"error\":{\"message\":\"Invalid model\"}}", {status: 400});
  }) as typeof fetch;
  await assert.rejects(ask("test/bad-model"), /400/);
  assert.equal(bodies.length, 1);
});
