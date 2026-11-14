import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {setEventSink} from "../renderer/platform/backend/shims/desktop";
import {assistantConnectInfo} from "../main/mcp/handlers";
import {declineOpenRequest, OPEN_VIDEO_EVENT, requestOpenVideo, takeOpenRequest} from "../main/mcp/windowRequests";
import type {OpenVideoRequest} from "../main/mcp/tools";

const request = (videoId: string): OpenVideoRequest => ({
  videoId,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  title: `Video ${videoId}`,
  startAt: 0,
  main: "ja",
  translation: "en"
});

const sent: string[] = [];
setEventSink((channel) => { sent.push(channel); });

afterEach(() => {
  sent.length = 0;
  takeOpenRequest();
});

test("a request nudges the window and resolves opened when the window takes it", async () => {
  const outcome = requestOpenVideo(request("aaaaaaaaaaa"), 1000);
  assert.deepEqual(sent, [OPEN_VIDEO_EVENT]);

  assert.deepEqual(takeOpenRequest(), request("aaaaaaaaaaa"));
  assert.equal(await outcome, "opened");
  // Taken once: the next ask finds nothing.
  assert.equal(takeOpenRequest(), null);
});

test("with no request waiting there is nothing to take", () => {
  assert.equal(takeOpenRequest(), null);
});

test("a request nobody takes resolves waiting after the wait, and can still be taken", async () => {
  assert.equal(await requestOpenVideo(request("aaaaaaaaaaa"), 10), "waiting");
  assert.deepEqual(takeOpenRequest(), request("aaaaaaaaaaa"));
});

test("a newer request replaces the older one, which resolves replaced", async () => {
  const older = requestOpenVideo(request("aaaaaaaaaaa"), 1000);
  const newer = requestOpenVideo(request("bbbbbbbbbbb"), 1000);
  assert.equal(await older, "replaced");
  assert.deepEqual(sent, [OPEN_VIDEO_EVENT, OPEN_VIDEO_EVENT]);

  assert.equal(takeOpenRequest()?.videoId, "bbbbbbbbbbb");
  assert.equal(await newer, "opened");
});

test("a request the learner turns down resolves declined and can't be taken later", async () => {
  const outcome = requestOpenVideo(request("aaaaaaaaaaa"), 1000);
  assert.equal(declineOpenRequest(), true);
  assert.equal(await outcome, "declined");
  // Showing the video page afterwards must not open the video they said no to.
  assert.equal(takeOpenRequest(), null);
  assert.equal(declineOpenRequest(), false);
});

test("the connect info names the command Claude Code and other apps run", () => {
  const info = assistantConnectInfo("C:\\Program Files\\Miteiru\\miteiru.exe", "win32");
  assert.equal(info.command, "C:\\Program Files\\Miteiru\\miteiru.exe");
  assert.equal(info.claudeCode, "claude mcp add miteiru -- \"C:\\Program Files\\Miteiru\\miteiru.exe\" --mcp");
  assert.deepEqual(JSON.parse(info.json), {mcpServers: {miteiru: {command: "C:\\Program Files\\Miteiru\\miteiru.exe", args: ["--mcp"]}}});
  assert.ok(info.json.includes("\n  "), "the JSON is indented to paste");
  assert.equal(info.warning, null);
});

test("on macOS and Linux the path is single-quoted, so $ and backticks stay as they are", () => {
  assert.equal(
    assistantConnectInfo("/home/me/Apps/Mi$teiru's `x`.AppImage", "linux").claudeCode,
    "claude mcp add miteiru -- '/home/me/Apps/Mi$teiru'\\''s `x`.AppImage' --mcp"
  );
});

test("a Mac app running from a temporary copy gets a warning: its path changes on every launch", () => {
  const info = assistantConnectInfo("/private/var/folders/xy/T/AppTranslocation/1A2B/d/Miteiru.app/Contents/MacOS/miteiru", "darwin");
  assert.match(info.warning ?? "", /Applications folder/);
  assert.equal(assistantConnectInfo("/Applications/Miteiru.app/Contents/MacOS/miteiru", "darwin").warning, null);
});
