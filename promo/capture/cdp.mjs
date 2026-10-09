// Usage: node cdp.mjs <port> <js-expression>  — evaluates in the Miteiru page and prints JSON.
const [port, expression] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
ws.send(JSON.stringify({id: 1, method: "Runtime.evaluate", params: {expression, awaitPromise: true, returnByValue: true}}));
const message = await new Promise((resolve) => ws.addEventListener("message", (event) => resolve(JSON.parse(event.data))));
console.log(JSON.stringify(message.result?.result?.value ?? message.result ?? message, null, 1));
ws.close();
