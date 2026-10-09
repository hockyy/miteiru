import assert from "node:assert/strict";
import {test} from "node:test";
import {cueMarksPath, previewLineAt} from "../renderer/components/VideoPlayer/SeekBar";
import {Line} from "../renderer/components/Subtitle/DataStructures";
import {rangeFillStyle} from "../renderer/utils/utils";

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
