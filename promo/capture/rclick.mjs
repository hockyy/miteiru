// Usage: node rclick.mjs <port> <x> <y> — right-click at CSS pixels.
const [port, x, y] = process.argv.slice(2).map(Number);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
let id = 0;
const send = (method, params) => new Promise((resolve) => { const c = ++id; ws.addEventListener("message", function l(e) { const m = JSON.parse(e.data); if (m.id === c) { ws.removeEventListener("message", l); resolve(m); } }); ws.send(JSON.stringify({id: c, method, params})); });
await send("Input.dispatchMouseEvent", {type: "mouseMoved", x, y});
await send("Input.dispatchMouseEvent", {type: "mousePressed", x, y, button: "right", clickCount: 1});
await send("Input.dispatchMouseEvent", {type: "mouseReleased", x, y, button: "right", clickCount: 1});
console.log("rclick", x, y); ws.close();
