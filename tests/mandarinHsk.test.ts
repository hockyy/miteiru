import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {compactHskWords} from '../scripts/data/buildMandarinHsk';
import {createHskLoader, hskLabel, hskUnderline, lookupHsk, type HskWords} from '../renderer/utils/mandarinHsk';
import {videoConstants} from '../renderer/utils/constants';
import {defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';
import {HookHost, deferred, flushPromises, loadHooks} from './helpers/reactHookHost';

test('compact HSK data uses only new HSK, all traditional forms and the earliest duplicate level', () => {
  assert.deepEqual(compactHskWords([
    {s: '学习', l: ['n2', 'o1', 't1'], f: [{t: '學習'}, {t: '学習'}]},
    {s: '学习', l: ['n1'], f: [{t: '學習'}]},
    {s: '高级', l: ['n7'], f: [{t: '高級'}]},
    {s: '旧', l: ['o1', 't1']},
  ]), {'学习': 1, '学習': 2, '學習': 1, '高级': 7, '高級': 7});
});

test('committed lookup covers simplified and traditional, uses the advanced band and stays small', () => {
  const bytes = fs.readFileSync('renderer/public/study-data/mandarin-hsk/words.json');
  const words: HskWords = JSON.parse(bytes.toString());
  assert.equal(Object.keys(words).length, 17700);
  assert.ok(bytes.byteLength < 200_000);
  assert.equal(words['学习'], words['學習']);
  assert.equal(lookupHsk(words, '学习'), 1);
  assert.equal(lookupHsk(words, '學習'), 1);
  assert.equal(lookupHsk(words, '阿拉伯语'), 7);
  assert.equal(lookupHsk(words, '阿拉伯語'), 7);
  assert.equal(lookupHsk(words, '麒麟星舰'), null);
  assert.equal(lookupHsk(words, '。'), undefined);
  assert.equal(lookupHsk(null, '你好'), undefined);
  assert.equal(hskLabel(7), 'HSK 7–9');
});

test('threshold hides known levels, retains unlisted words and treats 7–9 as a band', () => {
  assert.equal(hskUnderline(2, 2), undefined);
  assert.equal(hskUnderline(1, 9), undefined);
  assert.equal(hskUnderline(undefined), undefined);
  assert.equal(hskUnderline(3, 2)?.textDecorationStyle, 'solid');
  assert.equal(hskUnderline(null, 9)?.textDecorationStyle, 'dashed');
  assert.ok(hskUnderline(7, 7));
  assert.ok(hskUnderline(7, 8));
  assert.equal(hskUnderline(7, 9), undefined);
});

test('lazy HSK loader shares concurrent requests and quietly caches unavailable or invalid files', async () => {
  for (const [response, expected] of [[new Response(null, {status: 404}), null], [new Response('invalid'), null], [new Response('[]'), null], [new Response('{"你好":10}'), null], [new Response('{"你好":1}'), 1]] as const) {
    let calls = 0;
    const load = createHskLoader(async () => {calls++; return response;});
    const [a, b] = await Promise.all([load(), load()]);
    assert.equal(a, b);
    assert.equal(await load(), a);
    assert.equal(calls, 1);
    assert.equal(a?.['你好'] ?? null, expected);
  }
  const missing = createHskLoader(async () => {throw new Error('offline');});
  assert.equal(await missing(), null);
});

test('HSK hook loads only for enabled Mandarin and ignores a late result after changing language', async () => {
  const host = new HookHost();
  const {useMandarinHsk} = loadHooks<typeof import('../renderer/hooks/useMandarinHsk')>('renderer/hooks/useMandarinHsk.ts', host);
  const request = deferred<HskWords | null>();
  let calls = 0;
  const load = () => {calls++; return request.promise;};
  const render = (lang: string, enabled: boolean) => host.render(() => useMandarinHsk(lang, enabled, load));
  try {
    assert.equal(render(videoConstants.chineseLang, false), null);
    assert.equal(render(videoConstants.cantoneseLang, true), null);
    assert.equal(render(videoConstants.japaneseLang, true), null);
    assert.equal(calls, 0);
    assert.equal(render(videoConstants.chineseLang, true), null);
    assert.equal(calls, 1);
    assert.equal(render(videoConstants.cantoneseLang, true), null);
    request.resolve({'你好': 1});
    await flushPromises();
    assert.equal(render(videoConstants.cantoneseLang, true), null);
    render(videoConstants.chineseLang, true);
    await flushPromises();
    assert.equal(render(videoConstants.chineseLang, true)?.['你好'], 1);
    assert.equal(render(videoConstants.chineseLang, false), null);
  } finally {host.dispose();}
});

test('HSK underlines stay on Hanzi bases while tone colours, pinyin and reserved meaning rows survive', () => {
  const host = new HookHost();
  const {ChineseSentence} = loadHooks<typeof import('../renderer/components/Subtitle/Sentence')>('renderer/components/Subtitle/Sentence.tsx', host);
  const props: Parameters<typeof ChineseSentence>[0] = {
    origin: '你好', separation: [{main: '你', pinyin: 'nǐ'}, {main: '好', pinyin: 'hǎo'}],
    spokenTones: [2, 3], hskLevel: 1, extraClass: 'subtitle', wordMeaning: 'hello', setMeaning() {},
    getLearningStateClass: () => '', subtitleStyling: {...defaultPrimarySubtitleStyling, learning: false, mandarinToneColors: true, mandarinHsk: true},
  };
  try {
    const html = renderToStaticMarkup(host.render(() => ChineseSentence(props)));
    assert.ok(html.includes('data-hsk-level="1"'));
    assert.equal((html.match(/text-decoration-line:underline/g) ?? []).length, 2);
    assert.equal((html.match(/data-mandarin-tone=/g) ?? []).length, 4);
    assert.ok(!/<rt[^>]+text-decoration/.test(html));
    assert.ok(html.includes('ruby-row-reserved') && html.includes('nǐ') && html.includes('hǎo'));
    props.subtitleStyling = {...props.subtitleStyling, mandarinHskAbove: 1};
    assert.ok(!renderToStaticMarkup(host.render(() => ChineseSentence(props))).includes('text-decoration-line'));
  } finally {host.dispose();}
});

test('Mandarin subtitle controls keep sub-options hidden while off and stay absent for Cantonese', () => {
  const host = new HookHost();
  const {SubtitleContentSettings} = loadHooks<typeof import('../renderer/components/VideoPlayer/Sidebar')>('renderer/components/VideoPlayer/Sidebar.tsx', host);
  const render = (lang: string, on: boolean) => renderToStaticMarkup(host.render(() => SubtitleContentSettings({
    lang, subtitleStyling: {...defaultPrimarySubtitleStyling, mandarinToneColors: on, mandarinHsk: on}, setSubtitleStyling() {},
  })));
  try {
    const off = render(videoConstants.chineseLang, false);
    assert.ok(off.includes('Tone colours') && off.includes('HSK levels'));
    assert.ok(!off.includes('Tone key') && !off.includes('Levels you already know'));
    const on = render(videoConstants.chineseLang, true);
    assert.ok(on.includes('Tone key') && on.includes('Levels you already know'));
    const cantonese = render(videoConstants.cantoneseLang, true);
    assert.ok(!cantonese.includes('Tone colours') && !cantonese.includes('HSK levels'));
  } finally {host.dispose();}
});
