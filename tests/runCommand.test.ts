import assert from "node:assert/strict";
import {test} from "node:test";
import {createCommandRunner} from "../main/helpers/runCommand";
import {dispatchProcEvent, spawn as shimSpawn} from "../renderer/platform/backend/shims/childProcess";
import {setSys} from "../renderer/platform/backend/sys";

const runCommand = createCommandRunner(shimSpawn as unknown as typeof import("node:child_process").spawn);

for (const reason of ["cancel", "timeout"] as const) {
  test(`a command ${reason} before proc_spawn replies still kills the process once it starts`, async () => {
    let started: (id: number) => void;
    let killed: (id: number) => void;
    const spawnReply = new Promise<number>((resolve) => { started = resolve; });
    const killReply = new Promise<number>((resolve) => { killed = resolve; });
    const calls: number[] = [];
    setSys(async (command, args = {}) => {
      if (command === "proc_spawn") return spawnReply;
      if (command === "proc_kill") { calls.push(Number(args.id)); killed(Number(args.id)); return null; }
      throw new Error(`Unexpected syscall ${command}`);
    });
    const abort = new AbortController();
    const pending = runCommand("ffmpeg", ["segment"], reason === "cancel" ? {signal: abort.signal} : {timeoutMs: 5});
    if (reason === "cancel") abort.abort();
    await assert.rejects(pending, reason === "cancel" ? /cancelled/i : /timed out/i);
    assert.deepEqual(calls, []);
    const id = reason === "cancel" ? 201 : 202;
    started(id);
    assert.equal(await killReply, id);
    assert.deepEqual(calls, [id]);
    dispatchProcEvent("exit", {id, code: null, signal: "SIGTERM"});
  });
}

test("an already cancelled command never dispatches proc_spawn", () => {
  let calls = 0;
  setSys(async () => { calls++; return 1; });
  const abort = new AbortController();
  abort.abort();
  assert.throws(() => runCommand("ffmpeg", [], {signal: abort.signal}), /cancelled/i);
  assert.equal(calls, 0);
});
