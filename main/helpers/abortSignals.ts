/**
 * Abort signals for code that runs in the backend worker, inside the system webview. AbortSignal.any
 * arrived in Safari 17.4 and AbortSignal.timeout in Safari 16, but Miteiru supports macOS 11, whose
 * webview can be older, so both fall back to a hand-made controller there.
 */

/** A signal that aborts when `ms` have passed (TimeoutError), like AbortSignal.timeout. */
export const timeoutSignal = (ms: number): {signal: AbortSignal; dispose: () => void} => {
  if (typeof AbortSignal.timeout === "function") {
    return {signal: AbortSignal.timeout(ms), dispose: () => undefined};
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError()), ms);
  return {signal: controller.signal, dispose: () => clearTimeout(timer)};
};

const timeoutError = () => {
  const error = new Error("The operation timed out.");
  error.name = "TimeoutError";
  return error;
};

/**
 * One signal that aborts when any of `signals` does, with that signal's reason, like AbortSignal.any.
 * Call `dispose` when the work is done: the fallback then drops its listeners on the given signals,
 * which outlive the request (a job's signal serves many).
 */
export const linkAbortSignals = (
  signals: Array<AbortSignal | undefined>
): {signal: AbortSignal | undefined; dispose: () => void} => {
  const present = signals.filter((signal): signal is AbortSignal => !!signal);
  if (present.length === 0) return {signal: undefined, dispose: () => undefined};
  if (present.length === 1) return {signal: present[0], dispose: () => undefined};
  if (typeof (AbortSignal as {any?: unknown}).any === "function") {
    return {signal: AbortSignal.any(present), dispose: () => undefined};
  }
  const controller = new AbortController();
  const already = present.find((signal) => signal.aborted);
  if (already) {
    controller.abort(already.reason);
    return {signal: controller.signal, dispose: () => undefined};
  }
  const listeners = present.map((signal) => {
    const onAbort = () => {
      controller.abort(signal.reason);
      dispose();
    };
    signal.addEventListener("abort", onAbort, {once: true});
    return () => signal.removeEventListener("abort", onAbort);
  });
  const dispose = () => listeners.forEach((remove) => remove());
  return {signal: controller.signal, dispose};
};
