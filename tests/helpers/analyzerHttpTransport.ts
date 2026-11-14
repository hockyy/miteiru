import http from "node:http";
import {
  ANALYZER_HOST,
  ANALYZER_TOKEN_HEADER,
  type AnalyzerTransport
} from "../../main/handler/languages/analyzerServer";

/** The analyzer API over node:http, carrying requests the way the app's Rust listener does. */
export const nodeHttpTransport: AnalyzerTransport = (handle) => new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const token = req.headers[ANALYZER_TOKEN_HEADER];
    const {status, value} = await handle({
      method: req.method ?? "GET",
      path: req.url ?? "/",
      token: typeof token === "string" ? token : undefined,
      body: Buffer.concat(chunks).toString("utf8")
    });
    // No value is an empty body, as in the app's Rust listener.
    const body = value === undefined ? "" : JSON.stringify(value);
    res.writeHead(status, {"content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body)});
    res.end(body);
  });
  server.once("error", reject);
  server.listen(0, ANALYZER_HOST, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      reject(new Error("The test analyzer server has no TCP address."));
      return;
    }
    resolve({
      port: address.port,
      close: () => new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())))
    });
  });
});
