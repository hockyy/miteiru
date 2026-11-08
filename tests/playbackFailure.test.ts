import assert from "node:assert/strict";
import {test} from "node:test";
import {describePlaybackFailure} from "../renderer/components/VideoPlayer/playbackFailure";

const linuxMissing = "cannot load libmpv.so.1: libmpv.so.1: cannot open shared object file: No such file or directory";

test("a missing libmpv on Linux says what to install, not that the file is broken", () => {
  const failure = describePlaybackFailure(linuxMissing, "linux");
  assert.match(failure.title, /needs libmpv/);
  assert.match(failure.detail, /sudo apt install libmpv2/);
  assert.match(failure.detail, /libmpv1 on Ubuntu 22\.04/);
  assert.equal(failure.canTryAnother, false);
});

test("a missing libmpv where Miteiru ships it asks for a reinstall", () => {
  const failure = describePlaybackFailure("cannot load C:\\Program Files\\Miteiru\\libmpv-2.dll: The specified module could not be found. (os error 126)", "win32");
  assert.match(failure.detail, /Reinstall Miteiru/);
  assert.equal(failure.canTryAnother, false);
  assert.equal(describePlaybackFailure("libmpv was not found", "darwin").canTryAnother, false);
});

test("anything else is the file's", () => {
  for (const reason of [undefined, "", "unrecognized file format", "cannot load the file"]) {
    const failure = describePlaybackFailure(reason, "linux");
    assert.match(failure.title, /couldn’t play this file/);
    assert.equal(failure.canTryAnother, true);
  }
});
