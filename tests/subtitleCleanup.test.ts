import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {cleanHearingImpaired, SubtitleContainer} from "../renderer/components/Subtitle/DataStructures";

describe("cleanHearingImpaired: speaker labels", () => {
  const changes: Array<[string, string]> = [
    ["JOHN: Hello.", "Hello."],
    ["MAN 1: Hi there", "Hi there"],
    ["Narrator: Long ago", "Long ago"],
    ["Mr. Smith: Sit down.", "Sit down."],
    ["男：こんにちは", "こんにちは"],
    ["- JOHN: Hello", "- Hello"],
    ["[door slams] JOHN: Hello", "Hello"],
  ];
  for (const [input, expected] of changes) {
    it(`removes the label in ${JSON.stringify(input)}`, () => {
      assert.equal(cleanHearingImpaired(input), expected);
    });
  }

  const stays = [
    "We meet at 10:30 tonight.",
    "The train leaves at 7:45.",
    "午後3:00に駅で",
    "Re:Zero",
    "https://example.com",
    "Ratio 3:2",
    "時刻は12：30です",
    "Rule one: never run.",
    "and then: nothing",
  ];
  for (const input of stays) {
    it(`keeps ${JSON.stringify(input)}`, () => {
      assert.equal(cleanHearingImpaired(input), input);
    });
  }

  it("cleans each line of a cue on its own", () => {
    assert.equal(cleanHearingImpaired("ANNA: Hi\nIt is 10:30"), "Hi\nIt is 10:30");
  });
});

describe("createFromArrayEntries: order and same-time cues", () => {
  const build = (entries: Array<{from: number; to: number; text: string}>) =>
      SubtitleContainer.createFromArrayEntries(null as any, entries.map((e, i) => ({id: String(i), ...e})), "ja")
          .lines.map((line) => [line.timeStart, line.timeEnd, line.text]);

  it("gives the same lines as before for a file already in order", () => {
    assert.deepEqual(build([
      {from: 1000, to: 2000, text: "one"},
      {from: 3000, to: 4000, text: "two"},
    ]), [[1000, 2240, "one"], [3000, 4240, "two"]]);
  });

  it("keeps every dialogue line when the song lines are listed first", () => {
    const lines = build([
      {from: 60000, to: 64000, text: "song 1"},
      {from: 65000, to: 69000, text: "song 2"},
      {from: 1000, to: 2000, text: "d1"},
      {from: 3000, to: 4000, text: "d2"},
      {from: 5000, to: 6000, text: "d3"},
    ]);
    assert.deepEqual(lines.map((l) => l[2]), ["d1", "d2", "d3", "song 1", "song 2"]);
  });

  it("keeps equal starts in their order", () => {
    const lines = build([
      {from: 1000, to: 2000, text: "a"},
      {from: 1000, to: 3000, text: "b"},
    ]);
    assert.equal(lines[0][2], "a");
  });

  it("joins two cues with the same start and end into one line", () => {
    const lines = build([
      {from: 1000, to: 2000, text: "A: hi"},
      {from: 1000, to: 2000, text: "B: hello"},
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0][2], "A: hi\nB: hello");
  });

  it("shows identical texts once", () => {
    const lines = build([
      {from: 1000, to: 2000, text: "same"},
      {from: 1000, to: 2000, text: "same"},
    ]);
    assert.deepEqual(lines.map((l) => l[2]), ["same"]);
  });
});
