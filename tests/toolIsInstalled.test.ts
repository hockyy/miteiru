import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, test} from "node:test";
import {runtime} from "../renderer/platform/backend/shims/runtime";
import {getMiteiruToolsPath, toolIsInstalled} from "../main/handler/common/mediaTools";

const executable = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const neverOnPath = async () => null;
let savedUserData = "";

beforeEach(async () => {
  savedUserData = runtime.userData;
  runtime.userData = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-tools-test-"));
});

afterEach(() => {
  runtime.userData = savedUserData;
});

const placedElsewhere = async () => {
  // A copy in the old temp folder (Windows and macOS) or under Homebrew (macOS) counts too.
  const legacy = process.platform === "linux" ? [] : [path.join(os.tmpdir(), "miteiru_tools", executable)];
  const homebrew = process.platform === "darwin" ? ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"] : [];
  for (const file of [...legacy, ...homebrew]) {
    if (await fs.access(file).then(() => true, () => false)) return true;
  }
  return false;
};

test("a copy in Miteiru's tools folder counts, and nothing is run to find it", async () => {
  await fs.mkdir(getMiteiruToolsPath(), {recursive: true});
  await fs.writeFile(path.join(getMiteiruToolsPath(), executable), "");
  assert.equal(await toolIsInstalled("yt-dlp", async () => { throw new Error("PATH should not be searched"); }), true);
});

test("a command found on PATH counts", async () => {
  assert.equal(await toolIsInstalled("yt-dlp", async (command) => (command === "yt-dlp" ? "/usr/bin/yt-dlp" : null)), true);
});

test("with no copy anywhere, and a PATH lookup that fails, it is not installed", async (t) => {
  if (await placedElsewhere()) {
    t.skip("this computer has yt-dlp in a place every lookup finds");
    return;
  }
  assert.equal(await toolIsInstalled("yt-dlp", neverOnPath), false);
  assert.equal(await toolIsInstalled("yt-dlp", async () => { throw new Error("no PATH"); }), false);
});
