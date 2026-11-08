import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';
import {HookHost, loadHooks} from './helpers/reactHookHost';

type Components = typeof import('../renderer/components/Subtitle/Sentence');
const reserved = (html: string) => (html.match(/ruby-row-reserved/g) ?? []).length;

const render = (language: 'JapaneseSentence' | 'ChineseSentence', styling: object) => {
  const host = new HookHost();
  const components = loadHooks<Components>('renderer/components/Subtitle/Sentence.tsx', host);
  const word = language === 'JapaneseSentence' ? '見る' : '你好';
  const props: any = {
    origin: word, basicForm: word, separation: [{main: word, hiragana: '', pinyin: ''}],
    extraClass: 'subtitle', subtitleStyling: {...defaultPrimarySubtitleStyling, ...styling},
    setMeaning() {}, changeLearningState() {}, getLearningStateClass: () => 'state1'
  };
  try { return renderToStaticMarkup(host.render(() => components[language](props))); } finally { host.dispose(); }
};

test('Japanese words reserve the meaning and romaji rows only while those rows are on', () => {
  const off = {showMeaning: false, showRomaji: false};
  assert.equal(reserved(render('JapaneseSentence', off)), 0);
  assert.equal(reserved(render('JapaneseSentence', {...off, showMeaning: true})), 1);
  assert.equal(reserved(render('JapaneseSentence', {...off, showRomaji: true})), 1);
  assert.equal(reserved(render('JapaneseSentence', {showMeaning: true, showRomaji: true})), 2);
});

test('Chinese words reserve the meaning row when meanings or learning colours are on', () => {
  assert.equal(reserved(render('ChineseSentence', {showMeaning: false, learning: false})), 0);
  assert.equal(reserved(render('ChineseSentence', {showMeaning: true, learning: false})), 1);
  assert.equal(reserved(render('ChineseSentence', {showMeaning: false, learning: true})), 1);
});
