// Usage: node snap.mjs <port> <out.png> <w> <h> <dsf> [clear]
// Screenshot at a CSS viewport of w×h with device scale dsf. With "clear", the page background is
// transparent, so a page that hides its <video> leaves an alpha hole where the video was.
import fs from "node:fs";
const [port, out, w, h, dsf, clear] = process.argv.slice(2);
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
await send("Emulation.setDeviceMetricsOverride", {width: Number(w), height: Number(h), deviceScaleFactor: Number(dsf), mobile: false});
await send("Emulation.setDefaultBackgroundColorOverride", clear ? {color: {r: 0, g: 0, b: 0, a: 0}} : {});
// HOVER="x,y" puts the pointer back after the resize, which drops :hover.
if (process.env.HOVER) {
  const [x, y] = process.env.HOVER.split(",").map(Number);
  await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: x - 1, y});
  await send("Input.dispatchMouseEvent", {type: "mouseMoved", x, y});
}
await new Promise((resolve) => setTimeout(resolve, 350));
const {data} = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
fs.writeFileSync(out, Buffer.from(data, "base64"));
console.log("ok", out);
ws.close();
