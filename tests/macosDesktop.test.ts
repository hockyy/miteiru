import assert from "node:assert/strict";
import {test} from "node:test";
import React from "react";
import {renderToString} from "react-dom/server";
import {KeyboardHelp} from "../renderer/components/VideoPlayer/KeyboardHelp";
import {reloadPageOnShortcut} from "../renderer/platform/tauriBridge";

const withWindow = <T>(value: unknown, run: () => T): T => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", {configurable: true, value});
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
};

const reloadEvent = (overrides: Partial<KeyboardEvent> = {}) => Object.assign(
  new Event("keydown", {cancelable: true}),
  {key: "r", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false},
  overrides
) as KeyboardEvent;

test("Home shortcut HTML stays the same when the macOS preload is present", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    const server = renderToString(React.createElement(KeyboardHelp, {languageName: "Japanese"}));
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {electronAPI: {platform: "darwin"}}
    });
    const withPreload = renderToString(React.createElement(KeyboardHelp, {languageName: "Japanese"}));
    assert.match(server, /Ctrl \+ O/);
    assert.ok(withPreload === server, "The macOS preload changed the exported shortcut text");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("plain Cmd+R reloads once and consumes the macOS shortcut", () => {
  let reloads = 0;
  const event = reloadEvent();
  withWindow({electronAPI: {platform: "darwin"}, location: {reload: () => reloads++}}, () => {
    reloadPageOnShortcut(event);
  });
  assert.equal(reloads, 1);
  assert.equal(event.defaultPrevented, true);
});

test("reload leaves typing, other commands and modified Cmd+R alone", () => {
  const ignored = [
    reloadEvent({metaKey: false}),
    reloadEvent({metaKey: false, ctrlKey: true}),
    reloadEvent({ctrlKey: true}),
    reloadEvent({altKey: true}),
    reloadEvent({shiftKey: true}),
    reloadEvent({key: "h"})
  ];
  withWindow({electronAPI: {platform: "darwin"}, location: {reload: () => assert.fail("unexpected reload")}}, () => {
    ignored.forEach((event) => {
      reloadPageOnShortcut(event);
      assert.equal(event.defaultPrevented, false);
    });
    const handled = reloadEvent();
    handled.preventDefault();
    reloadPageOnShortcut(handled);
  });
});

test("the macOS reload binding does not override Windows or Linux", () => {
  for (const platform of ["win32", "linux"]) {
    withWindow({electronAPI: {platform}, location: {reload: () => assert.fail("unexpected reload")}}, () => {
      for (const event of [reloadEvent(), reloadEvent({metaKey: false, ctrlKey: true})]) {
        reloadPageOnShortcut(event);
        assert.equal(event.defaultPrevented, false);
      }
    });
  }
});
