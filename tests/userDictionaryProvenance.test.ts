import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getUserDictionaryProvenance} from '../renderer/components/Meaning/userDictionaryProvenance';
import {UserDictionaryEntryNotice} from '../renderer/components/Meaning/MeaningBox/components/UserDictionaryEntryNotice';
import {userChineseDictionaryResult, userJapaneseDictionaryResult, type UserDictionaryEntry} from '../main/helpers/userDictionary';
import type {MeaningContentState} from '../renderer/components/Meaning/MeaningBox/types';
import {deferred, HookHost, loadHooks} from './helpers/reactHookHost';

const provenance = {language: 'ja' as const, surface: '星詠み', source: 'ai' as const};
const entry = (source: 'ai' | 'manual' = 'ai'): UserDictionaryEntry => ({...provenance, source, reading: 'ほしよみ', meaning: 'divination by the stars', updatedAt: 1});
const content = (source: 'ai' | 'manual' = 'ai'): MeaningContentState => ({
  ...userJapaneseDictionaryResult(entry(source)), single: [{key: 0, text: '星詠み'}], content: '星詠み', simplified: '星詠み'
});
const globals = globalThis as Record<string, any>;
const savedWindow = globals.window;
afterEach(() => {
  if (savedWindow === undefined) delete globals.window;
  else globals.window = savedWindow;
});

test('custom dictionary payloads carry structured provenance for accurate labels and deletion', () => {
  assert.deepEqual(userJapaneseDictionaryResult(entry()).userDictionary, provenance);
  const chinese = entry();
  chinese.language = 'yue';
  assert.deepEqual(userChineseDictionaryResult(chinese).userDictionary, {...provenance, language: 'yue'});
  assert.deepEqual(getUserDictionaryProvenance(content()), provenance);
});

test('legacy saved Japanese entries keep their source and deletable surface without confusing builtins', () => {
  assert.deepEqual(getUserDictionaryProvenance({id: 'user:ja\0星詠み', sense: [{info: ['AI user dictionary']}]}), provenance);
  assert.deepEqual(getUserDictionaryProvenance({id: 'user:ja\0星詠み', sense: [{info: ['User dictionary']}]}), {...provenance, source: 'manual'});
  assert.equal(getUserDictionaryProvenance({id: '12345', sense: [{info: ['AI generated']}]}), null);
  assert.equal(getUserDictionaryProvenance({id: 'user:not-a-structured-id'}), null);
});

test('the meaning popup clearly marks AI-generated entries and never offers to delete builtins', () => {
  const ai = renderToStaticMarkup(React.createElement(UserDictionaryEntryNotice, {entry: content(), lang: 'ja'}));
  assert.match(ai, /Added by AI/);
  assert.match(ai, /Not from the built-in dictionary\./);
  assert.match(ai, />Remove</);
  assert.match(ai, /aria-label="Delete user dictionary entry /);
  const manual = renderToStaticMarkup(React.createElement(UserDictionaryEntryNotice, {entry: content('manual'), lang: 'ja'}));
  assert.match(manual, /Your entry/);
  assert.ok(!manual.includes('Added by AI'));
  const builtin = {...content(), id: '12345'};
  delete builtin.userDictionary;
  assert.equal(renderToStaticMarkup(React.createElement(UserDictionaryEntryNotice, {entry: builtin, lang: 'ja'})), '');
});

const findDeleteAction = (node: React.ReactNode): React.ReactElement<any> | undefined => {
  if (!React.isValidElement<any>(node)) return;
  const props = node.props as Record<string, any>;
  if ((props.onClick || props.onPress) && props['aria-label']?.startsWith('Delete user dictionary entry ')) return node;
  for (const child of React.Children.toArray(props.children)) {
    const found = findDeleteAction(child);
    if (found) return found;
  }
};

test('deleting an AI entry targets its dictionary language and saved surface, not the displayed lookup', async () => {
  const calls: unknown[][] = [];
  const pending = deferred<{ok: boolean}>();
  globals.window = {backend: {invoke: (...args: unknown[]) => {calls.push(args); return pending.promise;}}};
  const host = new HookHost();
  const {UserDictionaryEntryNotice: Notice} = loadHooks<typeof import('../renderer/components/Meaning/MeaningBox/components/UserDictionaryEntryNotice')>(
    'renderer/components/Meaning/MeaningBox/components/UserDictionaryEntryNotice.tsx', host
  );
  const read = () => host.render(() => Notice({entry: content(), lang: 'zh-CN'}));
  try {
    const action = findDeleteAction(read());
    assert.ok(action);
    const deleting = (action.props.onClick ?? action.props.onPress)();
    assert.deepEqual(calls, [['user-dictionary:delete', {language: 'ja', surface: '星詠み'}]]);
    assert.equal(findDeleteAction(read())?.props.disabled, true);
    pending.resolve({ok: true});
    await deleting;
    assert.equal(calls.length, 1);
  } finally {host.dispose();}
});

test('a failed dictionary deletion stays visible with its reason', async () => {
  globals.window = {backend: {invoke: async () => ({ok: false, error: 'Could not write the dictionary'})}};
  const host = new HookHost();
  const {UserDictionaryEntryNotice: Notice} = loadHooks<typeof import('../renderer/components/Meaning/MeaningBox/components/UserDictionaryEntryNotice')>(
    'renderer/components/Meaning/MeaningBox/components/UserDictionaryEntryNotice.tsx', host
  );
  const read = () => host.render(() => Notice({entry: content(), lang: 'ja'}));
  try {
    const action = findDeleteAction(read());
    assert.ok(action);
    await (action.props.onClick ?? action.props.onPress)();
    const markup = renderToStaticMarkup(read());
    assert.match(markup, /Could not write the dictionary/);
    assert.match(markup, /Added by AI/);
  } finally {host.dispose();}
});
