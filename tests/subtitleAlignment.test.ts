import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChineseSentence, JapaneseSentence, alignedWordRows} from '../renderer/components/Subtitle/Sentence';
import {CJKStyling, defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';

const styling = (overrides: Partial<CJKStyling> = {}): CJKStyling => ({...defaultPrimarySubtitleStyling, showRomaji: false, ...overrides});
const japanese = (origin: string, separation: any[], wordMeaning = '', settings = styling()) => renderToStaticMarkup(
  React.createElement(JapaneseSentence, {origin, basicForm: origin, separation, wordMeaning, subtitleStyling: settings, extraClass: '', setMeaning() {}})
);
const tracks = (markup: string) => markup.match(/style="([^"]*)"/)?.[1];

test('mixed Japanese annotations reserve identical tracks for every word, including punctuation', () => {
  const drink = japanese('飲めば', [{main: '飲', hiragana: 'の', isKanji: true}, {main: 'めば', isKana: true}], 'to drink');
  const kana = japanese('ほど', [{main: 'ほど', hiragana: 'ほど', isKana: true}]);
  const punctuation = japanese('。', [{main: '。'}]);
  assert.equal(tracks(drink), tracks(kana));
  assert.equal(tracks(drink), tracks(punctuation));
  assert.match(drink, /subtitle-word__reading unselectable">の<\/span>/);
  assert.match(kana, /subtitle-word__reading unselectable"><\/span>/);
  for (const markup of [drink, kana, punctuation]) {
    assert.match(markup, /subtitle-word__base/);
    assert.match(markup, /subtitle-word__romaji/);
    assert.match(markup, /subtitle-word__meaning/);
    assert.doesNotMatch(markup, /<ruby|<rt/);
  }
});

test('top meanings, romaji, and annotation settings choose shared rows without inspecting a word', () => {
  const settings = styling({positionMeaningTop: true, showRomaji: true});
  const annotated = japanese('楽しく', [{main: '楽', hiragana: 'たの', isKanji: true}, {main: 'しく', hiragana: 'しく', isKana: true}], 'enjoyable', settings);
  const empty = japanese('、', [{main: '、'}], '', settings);
  assert.equal(tracks(annotated), tracks(empty));
  assert.match(annotated, /data-meaning-position="top"/);
  assert.match(annotated, /subtitle-word__romaji unselectable">tano<\/span>/);
  assert.equal(alignedWordRows(settings, true)['--subtitle-meaning-bottom-height'], '0px');
  const disabled = alignedWordRows(styling({showMeaning: false, showFurigana: false, showRomaji: false}), true);
  assert.ok(Object.values(disabled).every(value => value === '0px'));
});

test('known Chinese words and empty readings keep the same base position as annotated new words', () => {
  const settings = styling({showMeaning: false, learning: true});
  const render = (state: string, pinyin: string) => renderToStaticMarkup(React.createElement(ChineseSentence, {
    origin: '你好', separation: [{main: '你', pinyin}, {main: '好', pinyin: ''}], wordMeaning: 'hello',
    subtitleStyling: settings, extraClass: '', getLearningStateClass: () => state, setMeaning() {}
  }));
  const newWord = render('state0', 'nǐ');
  const known = render('state2', 'nǐ');
  const missingReading = render('state0', '');
  assert.equal(tracks(newWord), tracks(known));
  assert.equal(tracks(newWord), tracks(missingReading));
  assert.match(newWord, />nǐ<\/span>/);
  assert.doesNotMatch(known, />nǐ<\/span>|>hello<\/span>/);
  assert.match(newWord, />hello<\/span>/);
});

test('Vietnamese preserves syllable spacing without adding an unused reading track', () => {
  const markup = renderToStaticMarkup(React.createElement(ChineseSentence, {
    origin: 'hôm nay', separation: [{main: 'hôm'}, {main: 'nay'}], wordMeaning: 'today',
    subtitleStyling: styling(), extraClass: '', setMeaning() {}
  }));
  assert.match(markup, /--subtitle-reading-height:0px/);
  assert.match(markup, /--subtitle-part-gap:0.16em/);
  assert.match(markup, />hôm<\/span>/);
  assert.match(markup, />nay<\/span>/);
});
