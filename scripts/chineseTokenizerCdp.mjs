import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import os from 'node:os';
import path from 'node:path';

export async function connectChineseTestApp(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find((entry) => entry.type === 'page' && entry.url.startsWith('http'));
  if (!target) throw new Error('The scratch app has no HTTP page target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const info = await evaluate("window.__TAURI_INTERNALS__.invoke('sys_info')");
  const profile = path.resolve(info.userData);
  const relative = path.relative(os.tmpdir(), profile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    socket.close();
    throw new Error('Refusing to control an app outside a scratch temporary profile');
  }
  return {send, evaluate, close: () => socket.close()};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [port, expressionPath] = process.argv.slice(2);
  const app = await connectChineseTestApp(Number(port));
  try { console.log(JSON.stringify(await app.evaluate(fs.readFileSync(expressionPath, 'utf8')), null, 2)); }
  finally { app.close(); }
}
