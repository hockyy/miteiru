import assert from 'node:assert/strict';
import {test} from 'node:test';
import {userJapaneseDictionaryResult} from '../main/helpers/userDictionary';
import {flushPromises, HookHost, loadHooks} from './helpers/reactHookHost';

test('an open word popup refreshes after its saved dictionary entry is deleted', async () => {
  const globals = globalThis as Record<string, any>;
  const savedWindow = globals.window;
  const listeners = new Set<(change: {language: string; surfaces: string[]}) => void>();
  let exists = true;
  let queries = 0;
  globals.window = {backend: {
    invoke: async (channel: string) => {
      if (channel === 'queryJapanese') {
        queries++;
        return exists ? [userJapaneseDictionaryResult({language: 'ja', source: 'ai', surface: '星詠み', reading: 'ほしよみ', meaning: 'star reading', updatedAt: 1})] : [];
      }
      assert.equal(channel, 'japaneseTags');
      return {};
    },
    on: (channel: string, listener: (change: {language: string; surfaces: string[]}) => void) => {
      assert.equal(channel, 'user-dictionary:changed');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  }};
  const host = new HookHost();
  const {useMeaningLookup} = loadHooks<typeof import('../renderer/components/Meaning/MeaningBox/hooks/useMeaningLookup')>('renderer/components/Meaning/MeaningBox/hooks/useMeaningLookup.ts', host);
  const read = () => host.render(() => useMeaningLookup('星詠み', 'ja', true));
  try {
    read();
    await flushPromises();
    assert.equal(read().meaningContent.userDictionary?.source, 'ai');
    assert.equal(queries, 1);
    listeners.forEach((listener) => listener({language: 'ja', surfaces: ['別の言葉']}));
    read();
    await flushPromises();
    assert.equal(queries, 1, 'unrelated additions do not repeat this lookup');
    exists = false;
    listeners.forEach((listener) => listener({language: 'ja', surfaces: ['星詠み']}));
    read();
    await flushPromises();
    const refreshed = read();
    assert.equal(queries, 2);
    assert.equal(refreshed.meaningContent.notFound, true);
    assert.equal(refreshed.meaningContent.userDictionary, undefined);
    assert.equal(refreshed.isOpen, true, 'the learner can see the refreshed result without reopening');
  } finally {
    host.dispose();
    if (savedWindow === undefined) delete globals.window;
    else globals.window = savedWindow;
  }
  assert.equal(listeners.size, 0);
});
