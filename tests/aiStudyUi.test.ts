import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AiStudySettings, aiStudyStatus, type AiStudyForecast} from '../renderer/components/VideoPlayer/Sidebar';
import {AiUsageView} from '../renderer/components/VideoPlayer/AiCostIndicator';
import {UserDictionaryPanel, searchDictionaryEntries} from '../renderer/components/VideoPlayer/UserDictionaryPanel';
import type {UserDictionaryEntry} from '../renderer/hooks/useUserDictionary';

const noop = () => undefined;
const forecast = (patch: Partial<AiStudyForecast> = {}): AiStudyForecast => ({
  tipsEnabled: false, setTipsEnabled: noop, dictionaryEnabled: false, setDictionaryEnabled: noop,
  lookahead: 30, setLookahead: noop, busy: false, error: '', retry: noop, hasApiKey: true, ...patch
});
const settings = (patch?: Partial<AiStudyForecast>, count = 3) => renderToStaticMarkup(
  React.createElement(AiStudySettings, {forecast: forecast(patch), dictionaryCount: count, onOpenDictionary: noop}));

test('the AI status line follows what the forecast is doing', () => {
  assert.equal(aiStudyStatus(forecast()), '');
  assert.equal(aiStudyStatus(forecast({tipsEnabled: true})), 'Ready. Finished parts are kept, so going back costs nothing.');
  assert.equal(aiStudyStatus(forecast({dictionaryEnabled: true, busy: true})), 'Preparing the next part…');
  assert.equal(aiStudyStatus(forecast({tipsEnabled: true, error: 'No credit'})), 'error');
});

test('Settings → AI lists the study tools, spending and the dictionary', () => {
  const markup = settings({tipsEnabled: true});
  for (const text of ['While you watch', 'Box tips', 'AI word splitting', 'Looks ahead', '30 s', '1 min', 'Spending',
    'Your dictionary', '3 words', 'Open your dictionary']) assert.ok(markup.includes(text), text);
  assert.match(markup, /role="status"[^>]*>Ready\./);
  assert.doesNotMatch(markup, /disabled=""/);
  assert.doesNotMatch(markup, /Add your OpenRouter key above/);
});

test('without an OpenRouter key the two toggles are disabled and the hint says why', () => {
  const markup = settings({hasApiKey: false});
  assert.match(markup, /Add your OpenRouter key above to use these\./);
  assert.equal(markup.match(/aria-disabled="true"/g)?.length, 4, 'two switches and their two labels');
  assert.doesNotMatch(markup, /role="status"/, 'every tool is off, so there is no status line');
});

test('an AI error shows in red with a Retry button', () => {
  const markup = settings({tipsEnabled: true, error: 'No credit left'});
  assert.match(markup, /text-red-200[^>]*>[^]*No credit left/);
  assert.match(markup, /Retry/);
});

test('spending shows the amount large, the request count and the unpriced note', () => {
  const clean = renderToStaticMarkup(React.createElement(AiUsageView, {usage: {observedCostUsd: 0.0042, totalRequests: 7, unpricedRequests: 0}}));
  assert.match(clean, /text-2xl font-black[^>]*>\$0\.0042</);
  assert.match(clean, /spent on AI on this device · 7 requests/);
  assert.match(clean, /Cached answers cost nothing\./);
  assert.doesNotMatch(clean, /no price from the provider/);
  const unpriced = renderToStaticMarkup(React.createElement(AiUsageView, {usage: {observedCostUsd: 1, totalRequests: 3, unpricedRequests: 2}}));
  assert.match(unpriced, /text-amber-200[^>]*>[^]*2 requests had no price from the provider, so the real total is a little higher\./);
  assert.match(renderToStaticMarkup(React.createElement(AiUsageView, {usage: null})), /Loading…/);
});

const entry = (surface: string, source: 'ai' | 'manual', meaning = 'a meaning'): UserDictionaryEntry =>
  ({surface, reading: `${surface}-reading`, meaning, language: 'ja', source, updatedAt: 0});
const panel = (entries: UserDictionaryEntry[], error = '') => renderToStaticMarkup(React.createElement(UserDictionaryPanel, {
  isOpen: true, onClose: noop, languageName: 'Japanese',
  dictionary: {entries, error, save: async () => undefined, remove: async () => undefined}
}));

test('the dictionary search matches word, reading and meaning', () => {
  const entries = [entry('星詠み', 'ai', 'stargazer'), entry('月', 'manual', 'moon')];
  assert.deepEqual(searchDictionaryEntries(entries, 'STAR').map((item) => item.surface), ['星詠み']);
  assert.deepEqual(searchDictionaryEntries(entries, '月-reading').map((item) => item.surface), ['月']);
  assert.equal(searchDictionaryEntries(entries, '  ').length, 2);
  assert.equal(searchDictionaryEntries(entries, 'zzz').length, 0);
});

test('the dictionary panel shows the form, source chips and Edit / Remove actions', () => {
  const markup = panel([entry('星詠み', 'ai'), entry('月', 'manual')]);
  assert.match(markup, /Your Japanese dictionary/);
  assert.match(markup, /Done/);
  for (const label of ['Word', 'Reading', 'Meaning', 'Save']) assert.ok(markup.includes(`>${label}<`), label);
  assert.match(markup, /ring-amber-300\/30[^>]*>AI</);
  assert.match(markup, /ring-sky-300\/30[^>]*>You</);
  assert.match(markup, /aria-label="Remove 星詠み"/);
  assert.match(markup, />Edit</);
  assert.match(markup, /disabled=""[^>]*>Save/, 'Save waits for a word and a meaning');
});

test('the dictionary panel explains an empty dictionary, shows errors, and caps the list at 100 rows', () => {
  assert.match(panel([]), /No words yet\. AI word splitting adds the words your dictionaries miss, or add one above\./);
  assert.match(panel([], 'Could not read'), /Could not read/);
  const many = Array.from({length: 130}, (_, index) => entry(`w${index}`, 'ai'));
  const markup = panel(many);
  assert.equal(markup.match(/aria-label="Remove /g)?.length, 100);
  assert.match(markup, /Search to narrow it down/);
});
