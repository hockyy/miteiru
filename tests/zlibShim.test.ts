import assert from "node:assert/strict";
import {promisify} from "node:util";
import {test} from "node:test";
import zlibShim, {zstdDecompress} from "../renderer/platform/backend/shims/zlib";
import {setSys} from "../renderer/platform/backend/sys";
import type {Call} from "./helpers/fakeSys";

// Stands in for the Rust command: the compressed bytes are "decompressed" by reversing them.
const install = (fail = false) => {
  const calls: Call[] = [];
  setSys(async (cmd, args = {}) => {
    calls.push({cmd, args});
    if (fail) throw "EINVAL: invalid argument, zstd decompress: corrupt";
    const bytes = Buffer.from(new Uint8Array(args.data as ArrayBuffer)).reverse();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  });
  return calls;
};

test("zstdDecompress sends the bytes to zstd_decompress as their own buffer and returns a Buffer", async () => {
  const calls = install();
  // A view into a larger buffer, as Node's Buffer pool makes: only its own bytes may be sent.
  const pooled = Buffer.from("xxabcdexx").subarray(2, 7);
  const result = await promisify(zstdDecompress)(pooled);
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result.toString(), "edcba");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "zstd_decompress");
  const sent = calls[0].args?.data as ArrayBuffer;
  assert.equal(sent.byteLength, 5);
  assert.equal(Buffer.from(sent).toString(), "abcde");
  assert.notEqual(sent, pooled.buffer);
});

test("zstdDecompress accepts options before the callback, is on the default export, and passes errors on", async () => {
  install();
  const withOptions = await new Promise<Buffer>((resolve, reject) => {
    zlibShim.zstdDecompress(Buffer.from("ab"), {}, (error: Error | null, result?: Buffer) => (error ? reject(error) : resolve(result as Buffer)));
  });
  assert.equal(withOptions.toString(), "ba");
  install(true);
  await assert.rejects(promisify(zstdDecompress)(Buffer.from("ab")), /EINVAL: invalid argument, zstd decompress/);
});
