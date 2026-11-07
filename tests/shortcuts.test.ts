import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {keyCommandDefinitions} from "../renderer/utils/keyCommands";
import {buildShortcutGroups, commandKeys} from "../renderer/utils/shortcuts";
import {formatKeys, hasCtrlModifier} from "../renderer/utils/platform";
import {toastDuration} from "../renderer/components/VideoPlayer/Toast";

const sheet = (options: { mac?: boolean } = {}) =>
    buildShortcutGroups(keyCommandDefinitions("Japanese"), {languageName: "Japanese", mac: false, ...options});
const items = (options?: { mac?: boolean }) => sheet(options).flatMap((group) => group.items);
const keysFor = (description: RegExp, options?: { mac?: boolean }) =>
    items(options).find((item) => description.test(item.description))?.keys;

describe("the shortcut sheet", () => {
  it("opens Study a text on Ctrl + Shift + L, not 'learning mode'", () => {
    assert.equal(keysFor(/Study a text/), "Ctrl + Shift + L");
    assert.ok(!items().some((item) => /learning mode/i.test(item.description)));
  });

  it("has no D key", () => {
    assert.ok(!items().some((item) => item.keys.split(" / ").includes("D")));
    assert.ok(!items().some((item) => /previous meaning box/i.test(item.description)));
  });

  it("lists the keys the review found missing", () => {
    assert.equal(keysFor(/lyrics/i), "M");
    assert.equal(keysFor(/Back or forward 2 seconds/), "← / →");
    assert.equal(keysFor(/5 seconds/), "Double-click");
    assert.equal(keysFor(/how well you know it/), "Right-click");
    assert.equal(keysFor(/^Copy the word$/), "W");
    assert.equal(keysFor(/with its reading/), "Shift + W");
    assert.equal(keysFor(/plain text/), "Shift + C");
    assert.equal(keysFor(/Search all commands/), "Ctrl + Shift + P");
  });

  it("names Esc and Backspace for the word popup", () => {
    assert.match(keysFor(/Close the word popup/) ?? "", /^Esc/);
    assert.equal(keysFor(/previous word/), "Backspace");
  });

  it("makes Ctrl + O open files and has no key that deletes a subtitle", () => {
    assert.equal(keysFor(/Open video or subtitles/), "Ctrl + O");
    assert.ok(!items().some((item) => /clear|remove|delete/i.test(item.description)));
    const ids: string[] = keyCommandDefinitions("Japanese").map((command) => command.id);
    assert.ok(!ids.includes("clear-primary-sub"));
    assert.ok(!ids.includes("clear-secondary-sub"));
  });

  it("says the language name, never CJK", () => {
    const text = JSON.stringify(sheet());
    assert.ok(!/CJK/.test(text));
    assert.match(text, /Show or hide the Japanese subtitle/);
    assert.match(JSON.stringify(buildShortcutGroups(keyCommandDefinitions(), {mac: false})), /the main subtitle/);
  });

  it("comes from the same commands: a new command shows up by itself", () => {
    const groups = buildShortcutGroups(
        [...keyCommandDefinitions("Japanese"), {id: "x", commandName: "A new thing", currentKey: "J", modifiers: ["Shift"], category: "Extras"}],
        {mac: false});
    assert.ok(groups.some((group) => group.title === "Extras" && group.items[0].keys === "Shift + J"));
  });

  it("gives two keys that do the same thing one line", () => {
    assert.equal(keysFor(/Close the word popup/), "Esc / H");
  });

  it("has every key once", () => {
    const seen = new Set<string>();
    for (const command of keyCommandDefinitions("Japanese")) {
      const keys = commandKeys(command, false);
      assert.ok(!seen.has(keys), `${keys} is bound twice`);
      seen.add(keys);
    }
  });

  it("shows ⌘ instead of Ctrl on macOS", () => {
    assert.equal(keysFor(/Study a text/, {mac: true}), "⌘ + Shift + L");
    assert.equal(keysFor(/Search all commands/, {mac: true}), "⌘ + Shift + P");
    assert.ok(!JSON.stringify(sheet({mac: true})).includes("Ctrl"));
    assert.equal(formatKeys(["Ctrl", "H"], true), "⌘ + H");
    assert.equal(formatKeys(["Ctrl", "H"], false), "Ctrl + H");
  });
});

describe("hasCtrlModifier", () => {
  it("accepts ⌘ only on macOS", () => {
    assert.equal(hasCtrlModifier({ctrlKey: false, metaKey: true}, true), true);
    assert.equal(hasCtrlModifier({ctrlKey: false, metaKey: true}, false), false);
    assert.equal(hasCtrlModifier({ctrlKey: true, metaKey: false}, false), true);
  });
});

describe("toastDuration", () => {
  it("keeps errors and toasts with a button up for 7 seconds, the rest for 3", () => {
    assert.equal(toastDuration({message: "Primary subtitle loaded"}), 3000);
    assert.equal(toastDuration({message: "Failed to load subtitle: no"}), 7000);
    assert.equal(toastDuration({message: "Could not open the files: x"}), 7000);
    assert.equal(toastDuration({message: "Whatever", error: true}), 7000);
    assert.equal(toastDuration({message: "Removed the translation", action: {label: "Undo", onPress: () => undefined}}), 7000);
    assert.equal(toastDuration({message: "Quick", duration: 500}), 500);
  });
});
