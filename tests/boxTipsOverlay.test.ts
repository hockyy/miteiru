import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BoxTipCard, BoxTipsOverlay} from '../renderer/components/VideoPlayer/BoxTipsOverlay';
import {formatAiCost} from '../renderer/components/VideoPlayer/AiCostIndicator';
import {PlaybackClock} from '../renderer/utils/playbackClock';
import {boxTipKey, compactBoxTipText, currentBoxTipIndex} from '../renderer/utils/boxTipPresentation';

test('Box tips can prerender while disabled without requiring a live playback clock', () => {
  const markup = renderToStaticMarkup(createElement(BoxTipsOverlay, {clock: new PlaybackClock(), tips: [], enabled: false}));
  assert.equal(markup, '');
});

test('Box tips stay readable with a stationary paused clock and render escaped text', () => {
  const props = {clock: new PlaybackClock(), enabled: true,
    tips: [{from: 0, to: 5000, kind: 'pun' as const, title: '<script>pun</script>', text: 'A < B & C'}]};
  const markup = renderToStaticMarkup(createElement(BoxTipsOverlay, props));
  assert.match(markup, /&lt;script&gt;pun&lt;\/script&gt;/);
  assert.match(markup, /A &lt; B &amp; C/);
  assert.equal(renderToStaticMarkup(createElement(BoxTipsOverlay, props)), markup);
  assert.equal(renderToStaticMarkup(createElement(BoxTipsOverlay, {...props, enabled: false})), '');
  assert.ok(!markup.includes('in '));
});

test('tips appear only on their current cue, respect subtitle shift, and follow seeks', () => {
  const tips = [
    {from: 1250, to: 2750, kind: 'grammar' as const, title: 'Phrase one', text: 'Short explanation.'},
    {from: 4000, to: 5000, kind: 'idiom' as const, title: 'Phrase two', text: 'Another explanation.'}
  ];
  assert.equal(currentBoxTipIndex(tips, 0), -1, 'future notes stay hidden');
  assert.equal(currentBoxTipIndex(tips, 1.249), -1);
  assert.equal(currentBoxTipIndex(tips, 1.25), 0);
  assert.equal(currentBoxTipIndex(tips, 2.75), -1, 'old notes disappear with their cue');
  assert.equal(currentBoxTipIndex(tips, 4.1), 1);
  assert.equal(currentBoxTipIndex(tips, 1.8), 0, 'seek back selects the earlier cue');
  assert.equal(currentBoxTipIndex(tips, 1.8, 1000), -1);
  assert.equal(currentBoxTipIndex(tips, 2.25, 1000), 0);
  assert.equal(currentBoxTipIndex(tips, 1.8, 0, [boxTipKey(tips[0])]), -1);
});

test('cached verbose notes get a brief preview and the card has no prediction or timestamp', () => {
  const long = 'This construction means when doing an important task. Here is a long explanation that should not fill the video.';
  assert.equal(compactBoxTipText(long), 'This construction means when doing an important task.');
  const words = compactBoxTipText(Array.from({length: 30}, (_, index) => `word${index}`).join(' '));
  assert.ok(words.split(' ').length <= 18);
  assert.ok(Array.from(words).length <= 120);
  const markup = renderToStaticMarkup(createElement(BoxTipCard, {tip: {from: 10000, to: 12000, kind: 'grammar', title: 'に際して', text: long}, onDismiss() {}}));
  assert.match(markup, /に際して/);
  assert.ok(!markup.includes('10000') && !markup.includes('in 10s') && !markup.includes('Here is a long'));
});

test('current tips can be selected from a long prepared history and overlapping cues', () => {
  const tips = Array.from({length: 10_000}, (_, index) => ({
    from: index * 10_000, to: index * 10_000 + 8000, kind: 'grammar' as const,
    title: `Tip ${index}`, text: 'A short English explanation.'
  }));
  assert.equal(currentBoxTipIndex(tips, 99_991), 9999);
  assert.equal(currentBoxTipIndex(tips, 1), 0);
  assert.equal(currentBoxTipIndex(tips, 99_999), -1);
  const overlapping = [tips[0], {...tips[0], from: 1000, to: 2000, title: 'Short overlap'}];
  assert.equal(currentBoxTipIndex(overlapping, 3), 0, 'an ended later tip cannot hide an active earlier cue');
});

test('English explanations are required even for cached notes with a Japanese heading', () => {
  const base = {from: 0, to: 5000, kind: 'grammar' as const, title: 'に際して'};
  assert.equal(currentBoxTipIndex([{...base, text: '这个表达表示在某个重要场合。'}], 1), -1);
  assert.equal(currentBoxTipIndex([{...base, text: 'これは大切な場面で使います。'}], 1), -1);
  assert.equal(currentBoxTipIndex([{...base, text: 'Use this formal phrase for important occasions.'}], 1), 0);
});

test('the spend indicator retains precision for small charges', () => {
  assert.equal(formatAiCost(0), '$0.00');
  assert.equal(formatAiCost(0.0012), '$0.0012');
  assert.equal(formatAiCost(1.234), '$1.23');
});
