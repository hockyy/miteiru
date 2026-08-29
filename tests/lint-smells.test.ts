import assert from "node:assert/strict";
import path from "node:path";
import {describe, it} from "node:test";
import {collectFindings} from "../scripts/lint-smells.js";

describe("lint-smells", () => {
  it("flags Electron clipboard.readText paste handlers", () => {
    const findings = collectFindings("renderer/foo.tsx", "navigator.clipboard.readText().then(() => {})");
    assert.ok(findings.some((finding) => finding.id === "no-clipboard-readText"));
  });

  it("flags YouTube self-referer that causes error 152", () => {
    const findings = collectFindings("main/main.ts", 'requestHeaders.Referer = "https://www.youtube.com/";');
    assert.ok(findings.some((finding) => finding.id === "no-youtube-self-referer"));
  });

  it("flags stacked miteiru_normalized_ temp names", () => {
    const findings = collectFindings(
      "main/handler/common/mediaHandlers.ts",
      "const outputPath = `miteiru_normalized_${safeBaseName}_${Date.now()}.srt`;"
    );
    assert.ok(findings.some((finding) => finding.id === "no-stacked-normalized-temp"));
  });

  it("allows the hashed cache helper", () => {
    const findings = collectFindings(
      path.normalize("main/helpers/subtitleCaches.ts"),
      "return path.join(tmpDir, `${NORMALIZED_SUBTITLE_PREFIX}${hash}.srt`);"
    );
    assert.equal(findings.some((finding) => finding.id === "no-stacked-normalized-temp"), false);
  });

  it("flags storing processed subtitlePath for reloads", () => {
    const findings = collectFindings(
      "renderer/hooks/useLoadFiles.tsx",
      "loadSubtitleAsPrimary(tmpSub, subtitlePath);"
    );
    assert.ok(findings.some((finding) => finding.id === "reload-original-subtitle-path"));
  });
});
