import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {isAppUrl, isWebUrl} from "../main/helpers/navigationGuard";
import {readStrokeSvg} from "../main/helpers/strokeSvg";
import {createMiteiruFileResponse} from "../main/miteiruProtocol";
import {MediaAnalyzer} from "../main/helpers/mediaAnalyzer";
import {getFurigana} from "../main/handler/languages/japaneseAnalysis";
import {renderSubtitleHtml} from "../renderer/utils/subtitleHtml";
import {defaultMecabPath} from "../renderer/utils/mecabPath";

test("only Miteiru's own pages count as app URLs", () => {
  assert.equal(isAppUrl("app://./video"), true);
  assert.equal(isAppUrl("http://localhost:8888/home"), true);
  assert.equal(isAppUrl("https://www.youtube.com/watch?v=x"), false);
  assert.equal(isAppUrl("file:///C:/Windows/System32/calc.exe"), false);
  assert.equal(isAppUrl("not a url"), false);
});

test("only http(s) links are handed to the system browser", () => {
  assert.equal(isWebUrl("https://github.com/settings/tokens/new"), true);
  assert.equal(isWebUrl("http://example.com"), true);
  assert.equal(isWebUrl("file:///etc/passwd"), false);
  assert.equal(isWebUrl("ms-msdt:/id PCWDiagnostic"), false);
  assert.equal(isWebUrl("javascript:alert(1)"), false);
});

const renderHtml = (html: string) => renderToStaticMarkup(React.createElement("div", null, renderSubtitleHtml(html)));

test("subtitle HTML keeps formatting tags", () => {
  assert.equal(renderHtml("<i>Hello</i> <b>there</b><br/>line"), "<div><i>Hello</i> <b>there</b><br/>line</div>");
  assert.equal(renderHtml('<font color="#ff0">yellow</font>'), '<div><font color="#ff0">yellow</font></div>');
});

test("subtitle HTML drops active content and unsafe attributes", () => {
  assert.equal(renderHtml('<iframe srcdoc="<script>parent.ipc.invoke(1)</script>"></iframe>ok'), "<div>ok</div>");
  assert.equal(renderHtml("<script>alert(1)</script>text"), "<div>text</div>");
  assert.equal(renderHtml('<img src=x onerror="alert(1)">caption'), "<div>caption</div>");
  assert.equal(renderHtml('<a href="javascript:alert(1)">link</a>'), "<div>link</div>");
  assert.equal(renderHtml('<span onclick="x()" style="background:url(http://evil)">hi</span>'), "<div><span>hi</span></div>");
});

test("stroke SVGs are read only by bare code-point file names", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-svg-test-"));
  await fs.writeFile(path.join(directory, "05b57.svg"), "<svg/>");
  await fs.writeFile(path.join(directory, "..secret.svg"), "nope");

  assert.equal(await readStrokeSvg(directory, "05b57.svg"), "<svg/>");
  assert.equal(await readStrokeSvg(directory, "../05b57.svg"), "");
  assert.equal(await readStrokeSvg(directory, "..secret.svg"), "");
  assert.equal(await readStrokeSvg(directory, path.join(directory, "05b57.svg")), "");
  assert.equal(await readStrokeSvg(directory, 42), "");
  await fs.rm(directory, {recursive: true, force: true});
});

test("miteiru:// shares files cross-origin only with Miteiru's pages", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-protocol-test-"));
  const file = path.join(directory, "clip.mp4");
  await fs.writeFile(file, "0123456789");
  const response = (origin?: string) => createMiteiruFileResponse(
    file,
    new Request("miteiru://local/clip.mp4", {headers: origin ? {origin} : {}})
  );

  assert.equal(response("app://.").headers.get("access-control-allow-origin"), "app://.");
  assert.equal(response("https://www.youtube.com").headers.get("access-control-allow-origin"), null);
  assert.equal(response().headers.get("access-control-allow-origin"), null);
  assert.equal(response().status, 200);
  await fs.rm(directory, {recursive: true, force: true});
});

test("only extracted subtitle files in the temp folder may be cleaned up", () => {
  assert.equal(MediaAnalyzer.isTempSubtitlePath(path.join(os.tmpdir(), "miteiru_subtitle_1_2.srt")), true);
  assert.equal(MediaAnalyzer.isTempSubtitlePath(path.join(os.tmpdir(), "other.srt")), false);
  assert.equal(MediaAnalyzer.isTempSubtitlePath(path.join(os.homedir(), "miteiru_subtitle_1_2.srt")), false);
  assert.equal(MediaAnalyzer.isTempSubtitlePath(path.join(os.tmpdir(), "x", "..", "..", "miteiru_subtitle_1.srt")), false);
  assert.equal(MediaAnalyzer.isTempSubtitlePath(undefined), false);
});

test("a missing MeCab binary yields no tokens instead of throwing", () => {
  assert.deepEqual(getFurigana("見た", path.join(os.tmpdir(), "no-such-mecab-binary")), []);
});

test("the Windows MeCab default path keeps its backslashes", () => {
  (globalThis as Record<string, unknown>).window = {electronAPI: {platform: "win32"}};
  assert.equal(defaultMecabPath(), "C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe");
  (globalThis as Record<string, unknown>).window = {electronAPI: {platform: "darwin"}};
  assert.equal(defaultMecabPath(), "/opt/homebrew/bin/mecab");
  delete (globalThis as Record<string, unknown>).window;
});
