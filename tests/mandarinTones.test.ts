import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {mandarinSpokenTones, pinyinTone, type MandarinPart} from '../renderer/utils/mandarinTones';
import {defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';
import {HookHost, loadHooks} from './helpers/reactHookHost';

const word = (text: string, readings: string) => ({separation: Array.from(text).map((main, i) => ({main, pinyin: readings.split(' ')[i]}))});

test('pinyin tones accept marks, decomposed vowels, digits and both app display modes', () => {
  for (const readings of [['mā', 'ma1', 'maˉ¹'], ['má', 'ma2', 'ma⸍²'], ['mǎ', 'ma3', 'maᵛ₃'], ['mà', 'ma4', 'ma⸌₄'], ['ma', 'ma0', 'ma5', 'ma·₅']]) {
    readings.forEach((reading) => assert.equal(pinyinTone(reading), pinyinTone(readings[0])));
  }
  assert.deepEqual(['mā', 'má', 'mǎ', 'mà', 'ma'].map(pinyinTone), [1, 2, 3, 4, 5]);
  assert.equal(pinyinTone('lǜ'.normalize('NFD')), 4);
  assert.equal(pinyinTone('nǚ'), 3);
  assert.deepEqual(['', ' ', '。', '你', '?', 'ni3 hao3'].map(pinyinTone), [null, null, null, null, null, null]);
});

test('不 and 一 see the next syllable across words in the same line', () => {
  assert.deepEqual(mandarinSpokenTones([word('不', 'bù'), word('是', 'shì')]), [[2], [4]]);
  assert.deepEqual(mandarinSpokenTones([word('不', 'bu⸌₄'), word('好', 'haoᵛ₃')]), [[4], [3]]);
  for (const [reading, expected] of [['mā', 4], ['má', 4], ['mǎ', 4], ['mà', 2], ['ma', 1]] as const) {
    assert.equal(mandarinSpokenTones([word('一', 'yī'), word('吗', reading)])[0][0], expected);
  }
  assert.deepEqual(mandarinSpokenTones([word('一个', 'yi1 ge4')]), [[2, 4]]);
  assert.deepEqual(mandarinSpokenTones([word('一', 'yī')]), [[1]]);
  assert.deepEqual(mandarinSpokenTones([word('不', 'bù')]), [[4]]);
});

test('一 keeps yī as an ordinal or at the end of a longer word', () => {
  assert.deepEqual(mandarinSpokenTones([word('第一', 'di4 yi1'), word('次', 'ci4')]), [[4, 1], [4]]);
  assert.deepEqual(mandarinSpokenTones([word('第', 'di4'), word('一', 'yi1'), word('次', 'ci4')]), [[4], [1], [4]]);
  assert.deepEqual(mandarinSpokenTones([word('统一', 'tong3 yi1'), word('是', 'shi4')]), [[3, 1], [4]]);
  assert.deepEqual(mandarinSpokenTones([word('一样', 'yi1 yang4')]), [[2, 4]]);
});

test('third-tone sandhi is limited to adjacent syllables inside one word', () => {
  const tokens = [word('你好', 'nǐ hǎo'), word('很好', 'hen3 hao3'), word('我', 'wo3'), word('好', 'hao3')];
  const original = JSON.stringify(tokens);
  assert.deepEqual(mandarinSpokenTones(tokens), [[2, 3], [2, 3], [3], [3]]);
  assert.equal(JSON.stringify(tokens), original);
  assert.deepEqual(mandarinSpokenTones([word('展览馆', 'zhan3 lan3 guan3')]), [[2, 2, 3]]);
});

test('sandhi stops at punctuation, whitespace, missing readings and non-Hanzi parts', () => {
  for (const boundary of [{main: '，', pinyin: '，'}, {main: ' ', pinyin: ' '}, {main: '好'}, {main: 'A', pinyin: 'a4'}]) {
    assert.deepEqual(mandarinSpokenTones([word('不', 'bu4'), {separation: [boundary]}, word('是', 'shi4')]), [[4], [null], [4]]);
  }
  assert.deepEqual(mandarinSpokenTones([{separation: [{main: '好', jyutping: 'hou2'} as MandarinPart]}]), [[null]]);
});

test('tone targets colour only the requested ruby part, without changing reading or meaning rows', () => {
  for (const target of ['hanzi', 'pinyin', 'both'] as const) {
    const host = new HookHost();
    const {ChineseSentence} = loadHooks<typeof import('../renderer/components/Subtitle/Sentence')>('renderer/components/Subtitle/Sentence.tsx', host);
    try {
      const props = {
        origin: '你好', separation: word('你好', 'nǐ hǎo').separation, spokenTones: [2, 3],
        setMeaning() {}, extraClass: 'subtitle', wordMeaning: 'hello',
        getLearningStateClass: () => '',
        subtitleStyling: {...defaultPrimarySubtitleStyling, learning: false, mandarinToneColors: true, mandarinToneTarget: target},
      };
      const render = (enabled: boolean) => {
        props.subtitleStyling = {...props.subtitleStyling, mandarinToneColors: enabled};
        return renderToStaticMarkup(host.render(() => ChineseSentence(props as Parameters<typeof ChineseSentence>[0])));
      };
      const on = render(true);
      assert.equal((on.match(/data-mandarin-tone=/g) ?? []).length, target === 'both' ? 4 : 2);
      assert.equal(/<rb[^>]+data-mandarin-tone/.test(on), target !== 'pinyin');
      assert.equal(/<rt[^>]+data-mandarin-tone/.test(on), target !== 'hanzi');
      assert.ok(on.includes('nǐ') && on.includes('hǎo') && on.includes('ruby-row-reserved'));
      assert.ok(!render(false).includes('data-mandarin-tone'));
    } finally {host.dispose();}
  }
});
