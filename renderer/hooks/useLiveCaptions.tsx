import {useCallback, useEffect, useRef, useState} from "react";

type LiveCaptionsState = "unsupported" | "stopped" | "starting" | "running" | "error";

interface LiveCaptionsApiState {
  supported: boolean;
  state: LiveCaptionsState;
  running: boolean;
  latestCaption: string;
  latestError: string;
  debugMessages?: string[];
}

const initialState: LiveCaptionsApiState = {
  supported: false,
  state: "unsupported",
  running: false,
  latestCaption: "",
  latestError: ""
};

const useLiveCaptions = () => {
  const [liveCaptionsState, setLiveCaptionsState] = useState<LiveCaptionsApiState>(initialState);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(250);
  const latestCaptionRef = useRef("");
  const lastCaptionFlushRef = useRef(0);
  const captionFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addDebugMessage = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugMessages((current) => [...current.slice(-19), `[${timestamp}] ${message}`]);
  }, []);

  const flushCaption = useCallback(() => {
    lastCaptionFlushRef.current = Date.now();
    setCaption(latestCaptionRef.current);
    captionFlushTimerRef.current = null;
  }, []);

  const queueCaption = useCallback((nextCaption: string) => {
    latestCaptionRef.current = nextCaption;
    const elapsed = Date.now() - lastCaptionFlushRef.current;

    if (elapsed >= refreshIntervalMs) {
      if (captionFlushTimerRef.current) {
        clearTimeout(captionFlushTimerRef.current);
        captionFlushTimerRef.current = null;
      }
      flushCaption();
      return;
    }

    if (!captionFlushTimerRef.current) {
      captionFlushTimerRef.current = setTimeout(flushCaption, refreshIntervalMs - elapsed);
    }
  }, [flushCaption, refreshIntervalMs]);

  useEffect(() => {
    let mounted = true;

    addDebugMessage("Loading Live Captions state from main process...");
    window.electronAPI.liveCaptions.getState()
    .then((state) => {
      if (!mounted) return;
      setLiveCaptionsState(state);
      latestCaptionRef.current = state.latestCaption ?? "";
      setCaption(latestCaptionRef.current);
      setError(state.latestError ?? "");
      setDebugMessages(state.debugMessages ?? []);
      addDebugMessage(`Initial state: ${state.state}`);
    })
    .catch((err) => {
      if (!mounted) return;
      setError(err.message);
      addDebugMessage(`Failed to read state: ${err.message}`);
    });

    const removeCaptionListener = window.electronAPI.liveCaptions.onCaption((nextCaption) => {
      queueCaption(nextCaption);
      if (nextCaption) addDebugMessage(`Caption received (${nextCaption.length} chars)`);
    });
    const removeStateListener = window.electronAPI.liveCaptions.onState((state) => {
      setLiveCaptionsState(state);
      queueCaption(state.latestCaption ?? "");
      setError(state.latestError ?? "");
      if (state.debugMessages) setDebugMessages(state.debugMessages);
    });
    const removeErrorListener = window.electronAPI.liveCaptions.onError((nextError) => {
      setError(nextError);
      addDebugMessage(`Error event: ${nextError}`);
    });
    const removeDebugListener = window.electronAPI.liveCaptions.onDebug((message) => {
      setDebugMessages((current) => [...current.slice(-19), message]);
    });

    return () => {
      mounted = false;
      removeCaptionListener();
      removeStateListener();
      removeErrorListener();
      removeDebugListener();
      if (captionFlushTimerRef.current) clearTimeout(captionFlushTimerRef.current);
    };
  }, [addDebugMessage, queueCaption]);

  const start = useCallback(async () => {
    addDebugMessage("Start requested from video page.");
    try {
      const state = await window.electronAPI.liveCaptions.start();
      setLiveCaptionsState(state);
      queueCaption(state.latestCaption ?? "");
      setError(state.latestError ?? "");
      if (state.debugMessages) setDebugMessages(state.debugMessages);
      addDebugMessage(`Start returned state: ${state.state}`);
    } catch (err) {
      setError(err.message);
      addDebugMessage(`Start failed: ${err.message}`);
    }
  }, [addDebugMessage, queueCaption]);

  const stop = useCallback(async () => {
    addDebugMessage("Stop requested from video page.");
    try {
      const state = await window.electronAPI.liveCaptions.stop();
      setLiveCaptionsState(state);
      latestCaptionRef.current = "";
      setCaption("");
      setError(state.latestError ?? "");
      if (state.debugMessages) setDebugMessages(state.debugMessages);
      addDebugMessage(`Stop returned state: ${state.state}`);
    } catch (err) {
      setError(err.message);
      addDebugMessage(`Stop failed: ${err.message}`);
    }
  }, [addDebugMessage]);

  const toggle = useCallback(async () => {
    if (liveCaptionsState.running || liveCaptionsState.state === "starting") {
      await stop();
    } else {
      await start();
    }
  }, [liveCaptionsState.running, liveCaptionsState.state, start, stop]);

  return {
    supported: liveCaptionsState.supported,
    state: liveCaptionsState.state,
    running: liveCaptionsState.running,
    starting: liveCaptionsState.state === "starting",
    caption,
    error,
    debugMessages,
    refreshIntervalMs,
    setRefreshIntervalMs,
    start,
    stop,
    toggle
  };
};

export default useLiveCaptions;
