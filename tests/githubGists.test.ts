import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {createGist, getGist, listGists} from "../main/handler/common/networkHandlers";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const stubFetch = (status: number, body: unknown) => {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return new Response(JSON.stringify(body), {status});
  }) as typeof fetch;
  return calls;
};

test("createGist posts one file with the token and returns its URL", async () => {
  const calls = stubFetch(201, {id: "abc", html_url: "https://gist.github.com/abc"});

  const result = await createGist("learning_state_ja.json", "{}", "Learning state for ja", false, "t0ken");

  assert.deepEqual(result, {gistUrl: "https://gist.github.com/abc", gistId: "abc"});
  assert.equal(calls[0].url, "https://api.github.com/gists");
  assert.equal(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("authorization"), "token t0ken");
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    files: {"learning_state_ja.json": {content: "{}"}},
    description: "Learning state for ja",
    public: false,
  });
});

test("listGists uses the token's own gists and maps the files", async () => {
  const calls = stubFetch(200, [{id: "1", description: "d", files: {"a.json": {language: "JSON", raw_url: "r"}}, html_url: "h"}]);

  const gists = await listGists("someone", "t0ken", 10, 2);

  assert.equal(calls[0].url, "https://api.github.com/gists?per_page=10&page=2");
  assert.equal(gists[0].files[0].filename, "a.json");
});

test("listGists without a token lists a user's public gists and sends no Authorization", async () => {
  const calls = stubFetch(200, []);
  await listGists("octo cat", "");
  assert.equal(calls[0].url, "https://api.github.com/users/octo%20cat/gists?per_page=30&page=1");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), null);
});

test("getGist returns file contents and GitHub's error message on failure", async () => {
  stubFetch(200, {id: "1", files: {"a.json": {content: "{\"x\":1}"}}, html_url: "h"});
  assert.equal((await getGist("1", "t")).files[0].content, "{\"x\":1}");

  stubFetch(401, {message: "Bad credentials"});
  await assert.rejects(getGist("1", "t"), /Bad credentials/);
});
