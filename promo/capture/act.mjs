// Usage: node act.mjs <port> <command> [args]
//   drop <file>...            drag files onto the page
//   key <code> <key> [mods]   press a key (mods: 1 alt, 2 ctrl, 4 meta, 8 shift)
//   click <x> <y>             mouse click at CSS pixels
//   hover <x> <y>             move the mouse
//   wheel <x> <y> <deltaY>    scroll at a point
//   shot <out.png> [w h]      screenshot (optionally at a viewport size)
import fs from "node:fs";
const [port, command, ...args] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
let id = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  const current = ++id;
  const listener = (event) => {
    const message = JSON.parse(event.data);
    if (message.id === current) { ws.removeEventListener("message", listener); resolve(message.result ?? message.error); }
  };
  ws.addEventListener("message", listener);
  ws.send(JSON.stringify({id: current, method, params}));
});
const VK = {ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Escape: 27, Enter: 13, Space: 32, Tab: 9};
if (command === "drop") {
  const data = {items: [], files: args.map((file) => file.replace(/\//g, "\\")), dragOperationsMask: 1};
  for (const type of ["dragEnter", "dragOver", "drop"]) await send("Input.dispatchDragEvent", {type, x: 600, y: 400, data});
} else if (command === "key") {
  const [code, key, mods = "0"] = args;
  const modifiers = Number(mods);
  const named = key.length > 1;
  const windowsVirtualKeyCode = VK[key] ?? (key === " " ? 32 : key.toUpperCase().charCodeAt(0));
  const text = named || (modifiers & ~8) ? undefined : key;
  await send("Input.dispatchKeyEvent", {type: text ? "keyDown" : "rawKeyDown", code, key, modifiers, windowsVirtualKeyCode, text});
  await send("Input.dispatchKeyEvent", {type: "keyUp", code, key, modifiers, windowsVirtualKeyCode});
} else if (command === "click" || command === "hover") {
  const [x, y] = args.map(Number);
  await send("Input.dispatchMouseEvent", {type: "mouseMoved", x, y});
  if (command === "click") {
    await send("Input.dispatchMouseEvent", {type: "mousePressed", x, y, button: "left", clickCount: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x, y, button: "left", clickCount: 1});
  }
} else if (command === "wheel") {
  const [x, y, deltaY] = args.map(Number);
  await send("Input.dispatchMouseEvent", {type: "mouseWheel", x, y, deltaX: 0, deltaY});
} else if (command === "shot") {
  const [out, width, height] = args;
  if (width) await send("Emulation.setDeviceMetricsOverride", {width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false});
  const {data} = await send("Page.captureScreenshot", {format: "png"});
  fs.writeFileSync(out, Buffer.from(data, "base64"));
}
console.log("ok", command);
ws.close();
