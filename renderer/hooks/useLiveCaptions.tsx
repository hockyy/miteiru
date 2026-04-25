import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  defaultLiveCaptionRefreshIntervalMs,
  LiveCaptionsApiState,
  maxLiveCaptionDebugMessages
} from "../types/liveCaptions";

const trimDebugMessages = (messages: string[]) => messages.slice(-maxLiveCaptionDebugMessages);

const initialState: LiveCaptionsApiState = {
  supported: false,
  state: "unsupported",
  running: false,
  latestCaption: "",
  latestError: ""
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const useLiveCaptions = () => {
  const [liveCaptionsState, setLiveCaptionsState] = useState<LiveCaptionsApiState>(initialState);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(defaultLiveCaptionRefreshIntervalMs);
  const latestCaptionRef = useRef("");
  const visibleCaptionRef = useRef("");
  const refreshIntervalRef = useRef(defaultLiveCaptionRefreshIntervalMs);
  const lastCaptionFlushRef = useRef(0);
  const captionFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replaceDebugMessages = useCallback((messages: string[] = []) => {
    setDebugMessages(trimDebugMessages(messages));
  }, []);

  const addDebugMessage = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugMessages((current) => trimDebugMessages([...current, `[${timestamp}] ${message}`]));
  }, []);

  const clearCaptionTimer = useCallback(() => {
    if (!captionFlushTimerRef.current) return;
    clearTimeout(captionFlushTimerRef.current);
    captionFlushTimerRef.current = null;
  }, []);

  const flushCaption = useCallback(() => {
    lastCaptionFlushRef.current = Date.now();
    visibleCaptionRef.current = latestCaptionRef.current;
    setCaption(visibleCaptionRef.current);
    captionFlushTimerRef.current = null;
  }, []);

  const queueCaptionUpdate = useCallback((nextCaption: string) => {
    latestCaptionRef.current = nextCaption;
    const elapsed = Date.now() - lastCaptionFlushRef.current;
    const refreshMs = refreshIntervalRef.current;

    if (elapsed >= refreshMs) {
      clearCaptionTimer();
      flushCaption();
      return;
    }

    if (!captionFlushTimerRef.current) {
      captionFlushTimerRef.current = setTimeout(flushCaption, refreshMs - elapsed);
    }
  }, [clearCaptionTimer, flushCaption]);

  const applyApiState = useCallback((state: LiveCaptionsApiState, options?: { flushCaption?: boolean }) => {
    setLiveCaptionsState(state);
    setError(state.latestError ?? "");
    if (state.debugMessages) replaceDebugMessages(state.debugMessages);

    const nextCaption = state.latestCaption ?? "";
    if (options?.flushCaption) {
      clearCaptionTimer();
      latestCaptionRef.current = nextCaption;
      visibleCaptionRef.current = nextCaption;
      setCaption(nextCaption);
      return;
    }

    queueCaptionUpdate(nextCaption);
  }, [clearCaptionTimer, queueCaptionUpdate, replaceDebugMessages]);

  useEffect(() => {
    refreshIntervalRef.current = refreshIntervalMs;

    if (captionFlushTimerRef.current && latestCaptionRef.current !== visibleCaptionRef.current) {
      clearCaptionTimer();
      queueCaptionUpdate(latestCaptionRef.current);
    }
  }, [clearCaptionTimer, queueCaptionUpdate, refreshIntervalMs]);

  useEffect(() => {
    let mounted = true;

    addDebugMessage("Loading Live Captions state from main process...");
    window.electronAPI.liveCaptions.getState()
    .then((state) => {
      if (!mounted) return;
      applyApiState(state, {flushCaption: true});
      addDebugMessage(`Initial state: ${state.state}`);
    })
    .catch((err) => {
      if (!mounted) return;
      const message = getErrorMessage(err);
      setError(message);
      addDebugMessage(`Failed to read state: ${message}`);
    });

    const removeCaptionListener = window.electronAPI.liveCaptions.onCaption((nextCaption) => {
      queueCaptionUpdate(nextCaption);
    });
    const removeStateListener = window.electronAPI.liveCaptions.onState((state) => {
      applyApiState(state);
    });
    const removeErrorListener = window.electronAPI.liveCaptions.onError((nextError) => {
      setError(nextError);
      addDebugMessage(`Error event: ${nextError}`);
    });
    const removeDebugListener = window.electronAPI.liveCaptions.onDebug((message) => {
      setDebugMessages((current) => trimDebugMessages([...current, message]));
    });

    return () => {
      mounted = false;
      removeCaptionListener();
      removeStateListener();
      removeErrorListener();
      removeDebugListener();
      clearCaptionTimer();
    };
  }, [addDebugMessage, applyApiState, clearCaptionTimer, queueCaptionUpdate]);

  const start = useCallback(async () => {
    addDebugMessage("Start requested from video page.");
    try {
      const state = await window.electronAPI.liveCaptions.start();
      applyApiState(state);
      addDebugMessage(`Start returned state: ${state.state}`);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      addDebugMessage(`Start failed: ${message}`);
    }
  }, [addDebugMessage, applyApiState]);

  const stop = useCallback(async () => {
    addDebugMessage("Stop requested from video page.");
    try {
      const state = await window.electronAPI.liveCaptions.stop();
      applyApiState({...state, latestCaption: ""}, {flushCaption: true});
      addDebugMessage(`Stop returned state: ${state.state}`);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      addDebugMessage(`Stop failed: ${message}`);
    }
  }, [addDebugMessage, applyApiState]);

  const toggle = useCallback(async () => {
    if (liveCaptionsState.running || liveCaptionsState.state === "starting") {
      await stop();
    } else {
      await start();
    }
  }, [liveCaptionsState.running, liveCaptionsState.state, start, stop]);

  return useMemo(() => ({
    supported: liveCaptionsState.supported,
    state: liveCaptionsState.state,
    running: liveCaptionsState.running,
    starting: liveCaptionsState.state === "starting",
    caption,
    error,
    debugMessages,
    refreshIntervalMs,
    setRefreshIntervalMs,
    toggle
  }), [
    caption,
    debugMessages,
    error,
    liveCaptionsState.running,
    liveCaptionsState.state,
    liveCaptionsState.supported,
    refreshIntervalMs,
    toggle
  ]);
};

export default useLiveCaptions;
