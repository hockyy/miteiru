import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerBoxTipsHandlers} from '../main/handler/common/boxTipsHandlers';
import {setStoreFactory} from '../main/handler/common/storeHandlers';
import {dispatchInvoke, ipcMain} from '../renderer/platform/backend/shims/electron';

test('forecast IPC rejects invalid request shapes and returns a safe result for malformed AI JSON', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let response = '{"tips":null}';
  const values = new Map<string, unknown>([['openrouter.apiKey', 'fake-key'], ['openrouter.model', 'fake/model']]);
  setStoreFactory(async () => ({get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => { values.set(key, value); }}));
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({choices: [{message: {content: response}}]}), {status: 200});
  };
  registerBoxTipsHandlers();
  const invoke = (request: unknown) => dispatchInvoke('box-tips:generate', [request]) as Promise<{ok: boolean; tips: unknown[]; error?: string}>;
  const valid = {requestId: 'forecast-shape-test', lang: 'ja', cues: [{from: 0, to: 1000, text: '試験'}]};
  try {
    for (const request of [undefined, null, false, 1, 'request', [], {}, {...valid, requestId: {}},
      {...valid, requestId: {toString: null}}, {...valid, lang: {}}, {...valid, includeTips: 'yes'}, {...valid, includeDictionary: []}]) {
      const result = await invoke(request);
      assert.equal(result.ok, false);
      assert.deepEqual(result.tips, []);
      assert.match(result.error ?? '', /Box tips request/);
    }
    assert.equal(calls, 0, 'invalid requests never dispatch a paid request');
    assert.equal(await dispatchInvoke('box-tips:cancel', [{}]), false);
    const invalid = await invoke(valid);
    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.tips, []);
    assert.match(invalid.error ?? '', /invalid Box tips response/);
    assert.equal(calls, 1);
    response = '{"tips":[]}';
    assert.deepEqual(await invoke(valid), {ok: true, tips: []});
    assert.equal(calls, 2, 'the same request can retry after a bad model reply');
    assert.deepEqual(await invoke(valid), {ok: true, tips: []});
    assert.equal(calls, 2, 'successful retries are still cached');
  } finally {
    globalThis.fetch = originalFetch;
    ipcMain.removeHandler('box-tips:generate');
    ipcMain.removeHandler('box-tips:cancel');
  }
});
