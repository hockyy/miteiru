import assert from "node:assert/strict";
import {test} from "node:test";
import {buildManifest} from "../scripts/makeUpdaterManifest.mjs";

const base = {version: "8.0.1", notes: "notes", pubDate: "2026-11-08T00:00:00.000Z", repo: "hockyy/miteiru", tag: "v8.0.1"};

test("each signed artifact becomes its platform's entry", () => {
  const manifest = buildManifest({
    ...base,
    signatures: {
      "Miteiru_8.0.1_x64-setup.exe": "sig-windows\n",
      "Miteiru_8.0.1_aarch64.app.tar.gz": "sig-mac",
      "Miteiru_8.0.1_amd64.AppImage": "sig-linux",
      "Miteiru_8.0.1_amd64.deb": "not an update artifact"
    }
  });
  assert.equal(manifest.version, "8.0.1");
  assert.equal(manifest.pub_date, base.pubDate);
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ["darwin-aarch64", "linux-x86_64", "windows-x86_64"]);
  assert.deepEqual(manifest.platforms["windows-x86_64"], {
    signature: "sig-windows",
    url: "https://github.com/hockyy/miteiru/releases/download/v8.0.1/Miteiru_8.0.1_x64-setup.exe"
  });
});

test("a rebuild of one platform keeps the others of the same version, and drops older ones", () => {
  const previous = {version: "8.0.1", platforms: {"linux-x86_64": {signature: "old-linux", url: "linux-url"}}};
  const rebuilt = buildManifest({...base, signatures: {"Miteiru_8.0.1_x64-setup.exe": "new-windows"}}, previous);
  assert.deepEqual(Object.keys(rebuilt.platforms).sort(), ["linux-x86_64", "windows-x86_64"]);

  const older = {version: "8.0.0", platforms: {"linux-x86_64": {signature: "old", url: "old"}}};
  const next = buildManifest({...base, signatures: {"Miteiru_8.0.1_x64-setup.exe": "new-windows"}}, older);
  assert.deepEqual(Object.keys(next.platforms), ["windows-x86_64"]);
});
