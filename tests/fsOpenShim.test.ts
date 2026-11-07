import assert from "node:assert/strict";
import {test} from "node:test";
import {open} from "../renderer/platform/backend/shims/fsImpl";
import {setSys, type SysCall} from "../renderer/platform/backend/sys";
import type {Call} from "./helpers/fakeSys";

const install = (files: Record<string, string>) => {
  const calls: Call[] = [];
  const handler: SysCall = async (cmd, args = {}) => {
    calls.push({cmd, args});
    const path = args.path as string;
    if (cmd === "fs_stat") {
      if (path === "/dir") return {isFile: false, isDirectory: true, size: 0, mtimeMs: 1};
      return path in files ? {isFile: true, isDirectory: false, size: files[path].length, mtimeMs: 1} : null;
    }
    if (cmd === "fs_read_range") {
      const offset = args.offset as number;
      const bytes = Buffer.from(files[path]).subarray(offset, offset + (args.length as number));
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    }
    throw new Error(`EINVAL: fake sys does not implement ${cmd}`);
  };
  setSys(handler);
  return calls;
};

test("read copies a range into the buffer at offset; an explicit position leaves the current one alone", async () => {
  const calls = install({"/f": "0123456789"});
  const handle = await open("/f", "r");
  const buffer = Buffer.alloc(8, "-");
  const result = await handle.read(buffer, 2, 4, 5);
  assert.equal(result.bytesRead, 4);
  assert.equal(result.buffer, buffer);
  assert.equal(buffer.toString(), "--5678--");
  assert.deepEqual(calls.at(-1), {cmd: "fs_read_range", args: {path: "/f", offset: 5, length: 4}});
  assert.equal((await handle.read(Buffer.alloc(2))).bytesRead, 2);
  assert.equal(calls.at(-1)?.args?.offset, 0);
  await handle.close();
});

test("a null position reads at the current position, which advances", async () => {
  const calls = install({"/f": "0123456789"});
  const handle = await open("/f");
  const buffer = Buffer.alloc(4);
  assert.equal((await handle.read(buffer, 0, 4, null)).bytesRead, 4);
  assert.equal(buffer.toString(), "0123");
  assert.equal((await handle.read(buffer)).bytesRead, 4);
  assert.equal(buffer.toString(), "4567");
  const last = await handle.read(buffer, 0, 4, undefined);
  assert.equal(last.bytesRead, 2);
  assert.equal(buffer.toString("utf8", 0, 2), "89");
  assert.equal((await handle.read(buffer)).bytesRead, 0);
  assert.deepEqual(calls.filter((call) => call.cmd === "fs_read_range").map((call) => call.args?.offset), [0, 4, 8, 10]);
  await handle.close();
});

test("open rejects like Node for a missing path and a directory, and only supports 'r'", async () => {
  install({"/f": "x"});
  await assert.rejects(open("/missing"), (error: NodeJS.ErrnoException) => error.code === "ENOENT" && error.message.includes("open '/missing'"));
  await assert.rejects(open("/dir"), (error: NodeJS.ErrnoException) => error.code === "EISDIR");
  await assert.rejects(open("/f", "w"), /not available/);
  await assert.rejects(open("/f", "r+"), /not available/);
});

test("read after close fails", async () => {
  install({"/f": "x"});
  const handle = await open("/f");
  await handle.close();
  await assert.rejects(handle.read(Buffer.alloc(1)), (error: NodeJS.ErrnoException) => error.code === "EBADF");
});
