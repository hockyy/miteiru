import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {codecFor, mmahSvgCodec, textCodec} from "../main/helpers/dataCodecs";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", "hanzi", name), "utf8");

test("the text codec stores the file as it is", () => {
  const text = "<svg>日本語 é</svg>\n";
  assert.equal(textCodec.decode(textCodec.encode(text)), text);
  assert.equal(textCodec.encode(text).toString("utf8"), text);
});

test("mmah-svg-1 rebuilds real Make Me a Hanzi files byte for byte, in far fewer bytes", () => {
  for (const name of ["26085.svg", "19968.svg"]) {
    const svg = fixture(name);
    const value = mmahSvgCodec.encode(svg);
    assert.equal(mmahSvgCodec.isStructured(value), true, `${name} is stored structured`);
    assert.equal(mmahSvgCodec.decode(value), svg, name);
    assert.ok(value.length < svg.length / 3, `${name}: ${value.length} of ${svg.length} bytes`);
  }
});

test("mmah-svg-1 stores a stroke's outline, median and length, and leaves out the numbers its rules give", () => {
  const strokes = mmahSvgCodec.encode(fixture("26085.svg")).subarray(1).toString("utf8").split("\n");
  assert.equal(strokes.length, 4);
  const [outline, median, ...rest] = strokes[1].split("\t");
  assert.match(outline, /^M 608 120 /);
  assert.match(median, /^M 359 660 /);
  assert.deepEqual(rest, ["1112"]);
});

test("mmah-svg-1 stores a number that differs from its rule exactly as written, and the file still round-trips structured", () => {
  const svg = fixture("26085.svg");
  const edits: Array<[string, string, string]> = [
    ["animation: keyframes1 1.2591145833333333s", "animation: keyframes1 1.25s", "1.25"],
    ["animation-delay: 0.97265625s;\n          animation-timing-function: linear;\n        }\n      \n        @keyframes keyframes2", "animation-delay: 1s;\n          animation-timing-function: linear;\n        }\n      \n        @keyframes keyframes2", "1"],
    ["stroke-dasharray=\"358 716\"", "stroke-dasharray=\"358 700\"", "358 700"]
  ];
  for (const [from, to, stored] of edits) {
    assert.ok(svg.includes(from), from);
    const edited = svg.replace(from, to);
    const value = mmahSvgCodec.encode(edited);
    assert.equal(mmahSvgCodec.isStructured(value), true, stored);
    assert.ok(value.toString("utf8").includes(stored), stored);
    assert.equal(mmahSvgCodec.decode(value), edited);
  }
});

test("a file the template does not reproduce is stored as plain text and still decodes", () => {
  const odd = [
    fixture("19968.svg").replace("stroke-linecap=\"round\"", "stroke-linecap=\"butt\""),
    fixture("19968.svg") + "\n",
    "<svg></svg>",
    ""
  ];
  for (const svg of odd) {
    const value = mmahSvgCodec.encode(svg);
    assert.equal(mmahSvgCodec.isStructured(value), false);
    assert.equal(value[0], 0);
    assert.equal(mmahSvgCodec.decode(value), svg);
  }
});

test("decoding refuses a value it does not know", () => {
  assert.throws(() => mmahSvgCodec.decode(Buffer.from([9, 65])), /unknown value kind/);
  assert.throws(() => mmahSvgCodec.decode(Buffer.from([1, 65])), /3 to 7 fields/);
});

test("a header's codec id picks the codec, and an unknown id is an error", () => {
  assert.equal(codecFor("text"), textCodec);
  assert.equal(codecFor("mmah-svg-1"), mmahSvgCodec);
  assert.throws(() => codecFor("mmah-svg-2"), /Unknown data codec/);
});
