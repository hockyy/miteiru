import {handleMcpBody, type ToolCall} from "../mcp/protocol";

/**
 * MCP over stdin and stdout: one JSON-RPC message (or batch) per line, each answer on its own line.
 * Calls run at once, so a slow one never holds up a quick one, and answers come in the order they
 * finish (their ids say which is which). A call the client cancelled gets no answer.
 *
 * When stdin closes, the calls still running are finished and answered before `serve` resolves: a
 * script may write its requests and close stdin straight away (the stdio bridge used to drop them).
 */
export interface StdioStreams {
  input: NodeJS.ReadableStream;
  write: (line: string) => void;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A JSON-RPC id as text, so 5 and "5" stay different ids. */
const idKey = (id: unknown) => JSON.stringify(id);

/** How long, after stdin closed, unanswered calls may still take before the server gives up on them. */
export const DRAIN_TIMEOUT_MS = 130_000;

export const serveStdio = async (
  {input, write}: StdioStreams,
  callTool: ToolCall,
  version: string,
  {drainTimeoutMs = DRAIN_TIMEOUT_MS}: {drainTimeoutMs?: number} = {}
): Promise<void> => {
  const running = new Set<string>();
  const cancelled = new Set<string>();
  const inFlight = new Set<Promise<void>>();

  const handleLine = async (line: string) => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      write(JSON.stringify({jsonrpc: "2.0", id: null, error: {code: -32700, message: "Parse error"}}));
      return;
    }
    if (isObject(message) && message.method === "notifications/cancelled") {
      const requestId = isObject(message.params) ? idKey(message.params.requestId) : undefined;
      // Only a call still running can be cancelled: a stale id would silence a later call that reuses it.
      if (requestId && running.has(requestId)) cancelled.add(requestId);
      return;
    }
    const key = isObject(message) && message.id !== undefined && typeof message.method === "string" ? idKey(message.id) : null;
    if (key) running.add(key);
    try {
      const {value} = await handleMcpBody(line, callTool, version);
      const dropped = key !== null && cancelled.has(key);
      if (value !== undefined && !dropped) write(JSON.stringify(value));
    } finally {
      if (key) {
        running.delete(key);
        cancelled.delete(key);
      }
    }
  };

  const track = (line: string) => {
    const work = handleLine(line).catch((error) => {
      console.error("[headless] a message failed:", error);
    });
    inFlight.add(work);
    work.finally(() => inFlight.delete(work));
  };

  await new Promise<void>((resolve) => {
    let buffered = "";
    input.setEncoding?.("utf8");
    input.on("data", (chunk: string | Buffer) => {
      buffered += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let newline: number;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) track(line);
      }
    });
    input.on("end", () => {
      const last = buffered.trim();
      if (last) track(last);
      resolve();
    });
    input.on("error", () => resolve());
  });

  // stdin is closed: answer what is still running, within the drain time.
  if (inFlight.size > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all([...inFlight]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, drainTimeoutMs);
      })
    ]);
    clearTimeout(timer);
  }
};
