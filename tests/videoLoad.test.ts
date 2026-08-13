import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createMiteiruFileResponse,
  parseRangeHeader,
  resolveMiteiruFilePath,
} from '../main/miteiruProtocol.ts';

test('parseRangeHeader parses full, open-ended and suffix ranges', () => {
  assert.deepEqual(parseRangeHeader('bytes=0-99', 1000), {start: 0, end: 99});
  assert.deepEqual(parseRangeHeader('bytes=100-', 1000), {start: 100, end: 999});
  assert.deepEqual(parseRangeHeader('bytes=-200', 1000), {start: 800, end: 999});
  assert.deepEqual(parseRangeHeader('bytes=0-', 1000), {start: 0, end: 999});
});

test('parseRangeHeader clamps the end to the file size', () => {
  assert.deepEqual(parseRangeHeader('bytes=0-9999', 1000), {start: 0, end: 999});
  assert.deepEqual(parseRangeHeader('bytes=-5000', 1000), {start: 0, end: 999});
});

test('parseRangeHeader rejects invalid ranges', () => {
  assert.equal(parseRangeHeader('bytes=500-100', 1000), null); // start > end
  assert.equal(parseRangeHeader('bytes=1000-', 1000), null); // starts past EOF
  assert.equal(parseRangeHeader('bytes=-0', 1000), null); // empty suffix
  assert.equal(parseRangeHeader('nonsense', 1000), null);
  assert.equal(parseRangeHeader('bytes=abc-def', 1000), null);
});

test('parseRangeHeader rejects suffix ranges for empty files', () => {
  assert.equal(parseRangeHeader('bytes=-10', 0), null);
  assert.deepEqual(parseRangeHeader('bytes=0-0', 1), {start: 0, end: 0});
});

test('resolveMiteiruFilePath resolves posix and encoded URLs', () => {
  assert.equal(
    resolveMiteiruFilePath('miteiru:///home/user/videos/my%20movie.mkv'),
    path.normalize('/home/user/videos/my movie.mkv'),
  );
});

test('resolveMiteiruFilePath recovers drive letters mangled into the host', () => {
  assert.equal(
    resolveMiteiruFilePath('miteiru://C/Users/me/video.mp4'),
    path.normalize('C:/Users/me/video.mp4'),
  );
});

const withTempVideo = async (fn: (filePath: string, bytes: Buffer) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miteiru-video-'));
  const filePath = path.join(dir, 'clip.mp4');
  const bytes = Buffer.from(Array.from({length: 256}, (_, i) => i));
  fs.writeFileSync(filePath, bytes);
  try {
    await fn(filePath, bytes);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
};

test('createMiteiruFileResponse serves the full file without a range header', async () => {
  await withTempVideo(async (filePath, bytes) => {
    const request = new Request(`miteiru://${filePath}`);
    const response = createMiteiruFileResponse(filePath, request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.equals(bytes));
  });
});

test('createMiteiruFileResponse serves partial content for valid ranges', async () => {
  await withTempVideo(async (filePath, bytes) => {
    const request = new Request(`miteiru://${filePath}`, {
      headers: {range: 'bytes=10-19'},
    });
    const response = createMiteiruFileResponse(filePath, request);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(
      response.headers.get('content-range'),
      `bytes 10-19/${bytes.length}`,
    );
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.equals(bytes.subarray(10, 20)));
  });
});

test('createMiteiruFileResponse answers 416 for unsatisfiable ranges', async () => {
  await withTempVideo(async (filePath, bytes) => {
    const request = new Request(`miteiru://${filePath}`, {
      headers: {range: 'bytes=9999-10000'},
    });
    const response = createMiteiruFileResponse(filePath, request);
    assert.equal(response.status, 416);
    assert.equal(
      response.headers.get('content-range'),
      `bytes */${bytes.length}`,
    );
  });
});

test('createMiteiruFileResponse falls back to octet-stream for unknown extensions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miteiru-video-'));
  const filePath = path.join(dir, 'track.xyz');
  fs.writeFileSync(filePath, 'data');
  try {
    const response = createMiteiruFileResponse(filePath, new Request('miteiru://x'));
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('createMiteiruFileResponse throws for missing files (handler turns it into 500)', async () => {
  assert.throws(() =>
    createMiteiruFileResponse('/nonexistent/video.mp4', new Request('miteiru://x')),
  );
});
