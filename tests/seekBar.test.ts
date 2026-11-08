import assert from "node:assert/strict";
import {test} from "node:test";
import {cueMarksPath, previewLineAt, prepareTipRanges, tipMarksPath, hasTipAt, type TipRange} from "../renderer/components/VideoPlayer/SeekBar";
import {Line} from "../renderer/components/Subtitle/DataStructures";
import {rangeFillStyle} from "../renderer/utils/utils";
import {PlaybackClock} from '../renderer/utils/playbackClock';
import {HookHost, loadHooks} from './helpers/reactHookHost';

const lines = [
  new Line(1000, 4000, "今日はいい天気ですね。"),
  new Line(5000, 9000, "Chúng ta cùng\nđi công viên nhé!"),
];

test("cueMarksPath draws one rectangle per line, shifted and clamped to the video", () => {
  assert.equal(cueMarksPath(lines, 10000), "M1000 0h3000v1h-3000zM5000 0h4000v1h-4000z");
  // A +2 s shift moves the lines later; the second one is cut at the end of the video.
  assert.equal(cueMarksPath(lines, 10000, 2000), "M3000 0h3000v1h-3000zM7000 0h3000v1h-3000z");
  assert.equal(cueMarksPath(lines, 0), "");
  assert.equal(cueMarksPath(undefined, 10000), "");
});

test("cueMarksPath skips lines outside the video and a line covering all of it", () => {
  assert.equal(cueMarksPath([new Line(20000, 25000, "late")], 10000), "");
  assert.equal(cueMarksPath([new Line(0, 1000000, "pasted text")], 10000), "");
});

test("previewLineAt shows the line at a video time, with the shift applied", () => {
  assert.equal(previewLineAt(lines, 2000), "今日はいい天気ですね。");
  assert.equal(previewLineAt(lines, 4500), "");
  // Line breaks become spaces.
  assert.equal(previewLineAt(lines, 6000), "Chúng ta cùng đi công viên nhé!");
  assert.equal(previewLineAt(lines, 2000, 1500), "");
  assert.equal(previewLineAt(lines, 3000, 1500), "今日はいい天気ですね。");
});

test("previewLineAt keeps the written text after the line is tokenized", () => {
  const line = new Line(0, 3000, "Hôm nay trời đẹp quá.");
  line.content = [{origin: "Hôm nay"}, {origin: "trời"}, {origin: "đẹp"}, {origin: "quá"}];
  assert.equal(previewLineAt([line], 1000), "Hôm nay trời đẹp quá.");
});

test("previewLineAt cuts long lines", () => {
  const preview = previewLineAt([new Line(0, 3000, "あ".repeat(200))], 1000);
  assert.equal(preview.length, 90);
  assert.ok(preview.endsWith("…"));
});

test("rangeFillStyle gives the filled share of a slider's track", () => {
  assert.deepEqual(rangeFillStyle(0.5, 0, 1), {"--fill": "50%"});
  assert.deepEqual(rangeFillStyle(0, -1, 2), {"--fill": "33.33333333333333%"});
  assert.deepEqual(rangeFillStyle(5, 0, 1), {"--fill": "100%"});
  assert.deepEqual(rangeFillStyle(1, 1, 1), {"--fill": "0%"});
});

test('Box tip markers shift to video time, clamp to duration and merge overlapping prepared ranges', () => {
  const prepared = prepareTipRanges([
    {from: 6000, to: 9000}, {from: 1000, to: 3000}, {from: 2500, to: 4000},
    {from: -5000, to: -3000}, {from: NaN, to: 5000}, {from: 5000, to: 4000}
  ], 10_000, 2000);
  assert.deepEqual(prepared, [{from: 3000, to: 6000}, {from: 8000, to: 10_000}]);
  assert.equal(tipMarksPath(prepared), 'M3000 0h3000v1h-3000zM8000 0h2000v1h-2000z');
  assert.deepEqual(prepareTipRanges([{from: 1000, to: 4000}], 10_000, -2000), [{from: 0, to: 2000}]);
  assert.deepEqual(prepareTipRanges([{from: 1000, to: 4000}], 0), []);
});

test('Box tip hover identifies only prepared intervals including cached positions behind playback', () => {
  const prepared = prepareTipRanges([{from: 1000, to: 4000}, {from: 50_000, to: 55_000}], 100_000);
  assert.equal(hasTipAt(prepared, 1000), true);
  assert.equal(hasTipAt(prepared, 3999), true);
  assert.equal(hasTipAt(prepared, 4000), false);
  assert.equal(hasTipAt(prepared, 20_000), false);
  assert.equal(hasTipAt(prepared, 51_000), true);
  assert.equal(hasTipAt(prepared, NaN), false);
});

const seekBar = (disabled = false, options: {tipRanges?: readonly TipRange[]; shiftMs?: number} = {}) => {
  const host = new HookHost();
  const {SeekBar} = loadHooks<typeof import('../renderer/components/VideoPlayer/SeekBar')>('renderer/components/VideoPlayer/SeekBar.tsx', host);
  const clock = new PlaybackClock();
  clock.set(10);
  const seeks: number[] = [];
  const props = {clock, durationMs: 100_000, onSeek: (ms: number) => { seeks.push(ms); }, disabled, ...options};
  const element = host.render(() => SeekBar(props));
  const root = {
    dataset: {} as Record<string, string>, clientWidth: 100,
    getBoundingClientRect: () => ({left: 0, width: 100}),
    setAttribute() {}, setPointerCapture() {}, focus() {}
  };
  element.props.ref.current = root;
  const pointer = (clientX: number) => ({button: 0, pointerId: 1, currentTarget: root, clientX});
  return {host, element, clock, seeks, pointer};
};

test('dragging previews the visible subtitle on every move and commits one player seek on release', () => {
  const {host, element, clock, seeks, pointer} = seekBar();
  try {
    element.props.onPointerDown(pointer(30));
    assert.equal(clock.get(), 30);
    clock.set(10.03);
    element.props.onPointerMove(pointer(60));
    clock.set(10.06);
    assert.equal(clock.get(), 60);
    assert.equal(clock.isPreviewing(), true);
    assert.deepEqual(seeks, []);
    element.props.onPointerUp(pointer(65));
    assert.equal(clock.get(), 65);
    assert.equal(clock.isPreviewing(), false);
    assert.deepEqual(seeks, [65_000]);
    element.props.onLostPointerCapture();
    assert.equal(clock.get(), 65);
  } finally { host.dispose(); }
});

test('red prepared markers paint above played progress and hovering reveals their Box tip label', () => {
  const {host, element, clock, pointer} = seekBar(false, {tipRanges: [{from: 1000, to: 3000}], shiftMs: 2000});
  try {
    const children = element.props.children;
    const trackChildren = children[0].props.children.filter(Boolean);
    const progressIndex = trackChildren.findIndex((child) => child.props.className === 'seek-bar__fill seek-bar__progress');
    const tipsIndex = trackChildren.findIndex((child) => child.props.className === 'seek-bar__tips');
    assert.ok(tipsIndex > progressIndex, 'red ranges remain visible above blue played progress');
    const marker = trackChildren[tipsIndex];
    assert.equal(marker.props.children.props.d, 'M3000 0h2000v1h-2000z');
    assert.equal(marker.props.children.props.vectorEffect, 'non-scaling-stroke');
    const tooltip = children[2];
    tooltip.props.ref.current = {style: {}, offsetWidth: 50};
    const label = tooltip.props.children.find((child) => child.props.className === 'seek-bar__tooltip-tip');
    label.props.ref.current = {hidden: true};
    clock.set(80);
    element.props.onPointerMove(pointer(4));
    assert.equal(label.props.ref.current.hidden, false, 'hovering a past tip still identifies it');
    element.props.onPointerMove(pointer(6));
    assert.equal(label.props.ref.current.hidden, true);
    assert.equal(marker.props.children.props.d, 'M3000 0h2000v1h-2000z', 'clock progress never removes prepared history');
  } finally { host.dispose(); }
});

test('cancelled touch/pointer drags restore the sampled player time without seeking', () => {
  const {host, element, clock, seeks, pointer} = seekBar();
  try {
    element.props.onPointerDown(pointer(70));
    clock.set(10.1);
    element.props.onPointerCancel();
    assert.equal(clock.get(), 10.1);
    assert.equal(clock.isPreviewing(), false);
    assert.deepEqual(seeks, []);
  } finally { host.dispose(); }
});

test('focused seek bar keyboard input seeks once and disabled controls cannot preview', () => {
  const {host, element, clock, seeks} = seekBar();
  let stopped = 0;
  try {
    const key = (value: string) => ({key: value, preventDefault() {}, stopPropagation() { stopped++; }});
    element.props.onKeyDown(key('End'));
    element.props.onKeyDown(key('ArrowLeft'));
    assert.equal(clock.get(), 98);
    assert.deepEqual(seeks, [100_000, 98_000]);
    assert.equal(stopped, 2, 'page keyboard shortcuts must not seek a second time');
  } finally { host.dispose(); }
  const locked = seekBar(true);
  try {
    locked.element.props.onPointerDown(locked.pointer(70));
    assert.equal(locked.clock.get(), 10);
    assert.equal(locked.clock.isPreviewing(), false);
    assert.deepEqual(locked.seeks, []);
  } finally { locked.host.dispose(); }
});
