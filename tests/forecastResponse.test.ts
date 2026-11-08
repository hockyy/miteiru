import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateForecastResult} from '../renderer/utils/forecastResponse';

test('forecast validation detaches the rendered fields from the IPC object and drops unknown fields', () => {
  const token = {origin: '見る', basicForm: '見る', hiragana: 'みる', contextMeaning: 'to watch',
    separation: [{main: '見', hiragana: 'み', isKanji: true}, {main: 'る', isKana: true}], extra: {bad: 'data'}};
  const input = {ok: true, tips: [], retokenizations: [{from: 0, to: 1000, text: '見る', tokens: [token]}]};
  const output = validateForecastResult(input);
  token.separation[0].main = 'changed';
  token.contextMeaning = 'changed';
  const rendered = output.retokenizations![0].tokens[0];
  assert.equal(rendered.separation[0].main, '見');
  assert.equal(rendered.contextMeaning, 'to watch');
  assert.equal('extra' in rendered, false);
});

test('forecast validation rejects sparse arrays and invalid nested reading fields before React sees them', () => {
  const valid = {origin: '見る', basicForm: '見る', contextMeaning: 'watch', separation: [{main: '見る'}]};
  const wrap = (tokens: unknown[]) => ({ok: true, tips: [], retokenizations: [{from: 0, to: 1000, text: '見る', tokens}]});
  for (const input of [
    wrap(Array(1)),
    {...wrap([valid]), retokenizations: Array(1)},
    wrap([{...valid, separation: [{main: {invalid: true}}]}]),
    wrap([{...valid, separation: [{main: '見る', hiragana: {invalid: true}}]}]),
    wrap([{...valid, separation: [{main: '見る', isKanji: 'yes'}]}]),
    wrap([{...valid, userDictionaryMeaning: {invalid: true}}])
  ]) assert.throws(() => validateForecastResult(input), /Invalid AI learning response/);
});
