import React from "react";

interface LiveCaptionControlProps {
  supported: boolean;
  running: boolean;
  starting: boolean;
  state: string;
  error?: string;
  debugMessages: string[];
  refreshIntervalMs: number;
  onRefreshIntervalChange: (refreshIntervalMs: number) => void;
  onToggle: () => void;
}

export const LiveCaptionControl = ({
  supported,
  running,
  starting,
  state,
  error,
  debugMessages,
  refreshIntervalMs,
  onRefreshIntervalChange,
  onToggle
}: LiveCaptionControlProps) => {
  if (!supported) return null;

  const statusText = error
    ? "Live Captions error"
    : starting
      ? "Starting captions"
      : running
        ? "Live Captions on"
        : "Live Captions off";
  const debugText = debugMessages.join("\n");
  const copyDebugLog = async () => {
    await navigator.clipboard.writeText(debugText || "No debug messages yet.");
  };

  return (
    <div className="group fixed bottom-20 right-4 z-20 pb-2 text-left">
      <button
        type="button"
        onClick={onToggle}
        disabled={starting}
        className={[
          "rounded-full border border-white/20 px-3 py-2 text-xs font-bold text-white shadow-lg transition-all",
          "bg-black/45 hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-60",
          running ? "ring-1 ring-green-300" : "",
          error ? "ring-1 ring-red-300" : ""
        ].join(" ")}
        title={statusText}
      >
        {running ? "CC Live On" : starting ? "CC..." : "CC Live"}
      </button>

      <div className="pointer-events-none absolute bottom-10 right-0 w-[min(88vw,420px)] translate-y-1 rounded-2xl border border-white/20 bg-black/90 p-3 text-white opacity-0 shadow-2xl transition-all group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black">{statusText}</div>
            <div className="mt-1 text-xs text-white/70">State: {state}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyDebugLog}
              className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold text-white/80 hover:bg-white/20 focus:outline-none focus:ring-1 focus:ring-white/60"
            >
              Copy log
            </button>
            <div className={running ? "text-green-300" : error ? "text-red-300" : "text-white/60"}>
              {running ? "●" : error ? "!" : "○"}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-300/30 bg-red-950/50 p-2 text-xs text-red-100">
            {error}
          </div>
        )}

        <div className="mt-3 rounded-xl bg-white/10 p-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-white/60">
            Subtitle refresh
          </label>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {[100, 250, 500, 1000].map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => onRefreshIntervalChange(interval)}
                className={[
                  "rounded-lg px-2 py-1 text-[11px] font-bold transition-colors",
                  refreshIntervalMs === interval
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/20"
                ].join(" ")}
              >
                {interval < 1000 ? `${interval}ms` : "1s"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 max-h-52 overflow-y-auto rounded-xl bg-white/10 p-2 font-mono text-[11px] leading-relaxed text-white/80 select-text">
          {debugMessages.length === 0 ? (
            <div>No debug messages yet.</div>
          ) : (
            debugMessages.slice(-12).map((message, index) => (
              <div key={`${message}-${index}`}>{message}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
