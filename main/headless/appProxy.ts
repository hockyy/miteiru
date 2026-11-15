import {runningApps, type RunningApp} from "./profile";

/**
 * Tool calls the headless server hands to a running Miteiru (docs/LOCAL_API.md, POST /mcp): open_video,
 * which needs its window, and set_word_levels, so the window shows the change at once. Everything else
 * the headless server answers itself, with the same code.
 */
export type ProxyOutcome =
  /** The app ran the tool: its result, or its failure text. */
  | {answered: true; result?: unknown; error?: string}
  /** No running app took it: none is open, or it is a version without the tool. */
  | {answered: false; reason: "not-open" | "unknown-tool"};

const TOKEN_HEADER = "X-Miteiru-Analyzer-Token";
/** A little longer than the app gives its worker (src-tauri/src/analyzer.rs), so the app's own 504 arrives first. */
const CALL_TIMEOUT_MS = 130_000;

type Fetch = (url: string, init: {method: string; headers: Record<string, string>; body: string; signal: AbortSignal}) => Promise<{status: number; text(): Promise<string>}>;

export const createAppProxy = (dirs: string[], {fetcher = fetch as unknown as Fetch, apps = runningApps}: {fetcher?: Fetch; apps?: (dirs: string[]) => RunningApp[]} = {}) => {
  let nextId = 1;

  const post = async (app: RunningApp, name: string, args: Record<string, unknown>) => {
    const body = JSON.stringify({jsonrpc: "2.0", id: nextId++, method: "tools/call", params: {name, arguments: args}});
    const response = await fetcher(`http://${app.host}:${app.port}/mcp`, {
      method: "POST",
      headers: {"Content-Type": "application/json", Accept: "application/json, text/event-stream", [TOKEN_HEADER]: app.token},
      body,
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
    });
    return {status: response.status, text: await response.text()};
  };

  /** Runs `name` in the newest running app that answers; says so when none does. */
  const call = async (name: string, args: Record<string, unknown>): Promise<ProxyOutcome> => {
    let unknownTool = false;
    for (const app of apps(dirs)) {
      let reply: {status: number; text: string};
      try {
        reply = await post(app, name, args);
      } catch {
        // Nothing listens there (it closed), or it took too long: try the other build's app.
        continue;
      }
      // A stale registration whose port a newer Miteiru now uses.
      if (reply.status === 401) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(reply.text);
      } catch {
        return {answered: true, error: `Miteiru answered with HTTP ${reply.status}.`};
      }
      if (reply.status !== 200) return {answered: true, error: typeof parsed?.error === "string" ? parsed.error : `Miteiru answered with HTTP ${reply.status}.`};
      // An app from before this tool: -32602 Unknown tool.
      if (parsed?.error?.code === -32602) {
        unknownTool = true;
        continue;
      }
      if (parsed?.error) return {answered: true, error: String(parsed.error.message ?? "Miteiru could not run the tool.")};
      const result = parsed?.result;
      if (result?.isError) return {answered: true, error: String(result.content?.[0]?.text ?? "Miteiru could not run the tool.")};
      return {answered: true, result: result?.structuredContent ?? JSON.parse(result?.content?.[0]?.text ?? "null")};
    }
    return {answered: false, reason: unknownTool ? "unknown-tool" : "not-open"};
  };

  return {call};
};
