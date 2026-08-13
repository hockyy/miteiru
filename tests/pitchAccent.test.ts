import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAccent,
  isMoraHigh,
  lookupPitchAccent,
  splitIntoMorae,
  toHiraganaSafe,
  type PitchAccentMap,
} from '../renderer/utils/pitchAccent.ts';

test('splitIntoMorae keeps small kana attached to the previous mora', () => {
  assert.deepEqual(splitIntoMorae('とうきょう'), ['と', 'う', 'きょ', 'う']);
  assert.deepEqual(splitIntoMorae('がっこう'), ['が', 'っ', 'こ', 'う']);
  assert.deepEqual(splitIntoMorae('ねこ'), ['ね', 'こ']);
  assert.deepEqual(splitIntoMorae('コーヒー'), ['コ', 'ー', 'ヒ', 'ー']);
  assert.deepEqual(splitIntoMorae('じゃんけん'), ['じゃ', 'ん', 'け', 'ん']);
});

test('splitIntoMorae handles a leading small kana defensively', () => {
  assert.deepEqual(splitIntoMorae('ゃ'), ['ゃ']);
});

test('toHiraganaSafe converts katakana and leaves other scripts alone', () => {
  assert.equal(toHiraganaSafe('ニホン'), 'にほん');
  assert.equal(toHiraganaSafe('一般'), '一般');
  assert.equal(toHiraganaSafe('コーヒー'), 'こーひー');
});

test('classifyAccent maps accent number + mora count to pattern', () => {
  assert.equal(classifyAccent(0, 3), 'heiban');
  assert.equal(classifyAccent(1, 3), 'atamadaka');
  assert.equal(classifyAccent(2, 3), 'nakadaka');
  assert.equal(classifyAccent(3, 3), 'odaka');
  assert.equal(classifyAccent(2, 4), 'nakadaka');
  assert.equal(classifyAccent(4, 4), 'odaka');
  assert.equal(classifyAccent(1, 1), 'atamadaka');
  assert.equal(classifyAccent(0, 1), 'heiban');
});

test('isMoraHigh reproduces Tokyo pitch contours', () => {
  // heiban さくら[0]: L H H
  assert.deepEqual([1, 2, 3].map((i) => isMoraHigh(0, i)), [false, true, true]);
  // atamadaka ねこ[1]: H L
  assert.deepEqual([1, 2].map((i) => isMoraHigh(1, i)), [true, false]);
  // nakadaka たかい[2]: L H L
  assert.deepEqual([1, 2, 3].map((i) => isMoraHigh(2, i)), [false, true, false]);
  // odaka おとこ[3]: L H H (drop lands on the following particle)
  assert.deepEqual([1, 2, 3].map((i) => isMoraHigh(3, i)), [false, true, true]);
});

const fixture: PitchAccentMap = {
  words: {
    一般: {いっぱん: [0]},
    日本: {にほん: [2], にっぽん: [3]},
    猫: {ねこ: [1]},
    あかい: {あかい: [0, 2]},
  },
};

test('lookupPitchAccent finds surface + reading pairs', () => {
  assert.deepEqual(lookupPitchAccent(fixture, '一般', 'いっぱん'), [0]);
  assert.deepEqual(lookupPitchAccent(fixture, '日本', 'にほん'), [2]);
  assert.deepEqual(lookupPitchAccent(fixture, '日本', 'にっぽん'), [3]);
});

test('lookupPitchAccent normalizes katakana readings', () => {
  assert.deepEqual(lookupPitchAccent(fixture, '日本', 'ニホン'), [2]);
});

test('lookupPitchAccent falls back to kana-only headwords', () => {
  assert.deepEqual(lookupPitchAccent(fixture, 'あかい', 'あかい'), [0, 2]);
});

test('lookupPitchAccent returns null for unknown words or readings', () => {
  assert.equal(lookupPitchAccent(fixture, '食べる', 'たべる'), null);
  assert.equal(lookupPitchAccent(fixture, '日本', 'にっぽん') !== null, true);
  assert.deepEqual(lookupPitchAccent(fixture, '日本', 'ニッポン'), [3]);
  assert.equal(lookupPitchAccent(fixture, '日本', 'ジャパン'), null);
  assert.equal(lookupPitchAccent(null as unknown as PitchAccentMap, '日本', 'にほん'), null);
});
