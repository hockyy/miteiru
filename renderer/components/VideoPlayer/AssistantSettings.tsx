/**
 * How to connect an AI assistant (Claude Code, or any app that reads MCP settings) to this Miteiru:
 * the command to run and the settings to paste, from the backend (main/mcp/handlers.ts). Shown on
 * the video Settings' AI tab, after the OpenRouter and study settings.
 */
import React, {useCallback, useEffect, useRef, useState} from "react";
import {Button} from "../Utils/Button";
import {SidebarSection} from "./SidebarShell";

interface ConnectInfo {
  command: string;
  claudeCode: string;
  json: string;
  /** Why the command may stop working (macOS running a temporary copy of the app), or null. */
  warning: string | null;
}

const COPIED_SHOWN_MS = 2000;

const Hint = ({children}: { children: React.ReactNode }) => (
  <div className="text-xs text-white/60">{children}</div>
);

type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {idle: "Copy", copied: "Copied", failed: "Couldn't copy"};

/** A line or block of text to copy into another app, in a box whose text can be selected by hand too. */
const CopyBox = ({label, text, multiline = false}: { label: string; text: string; multiline?: boolean }) => {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPIED_SHOWN_MS);
  }, [text]);

  return <div className="flex flex-col gap-2">
    <div className="text-sm text-white/85">{label}</div>
    <div className="flex min-w-0 flex-row items-start gap-2">
      {/* select-text: the page turns selection off in places, and this is meant to be copied by hand too. */}
      <div className={`min-w-0 flex-1 select-text rounded-lg bg-black/30 px-2 py-1.5 font-mono text-xs ${multiline ? "overflow-x-auto whitespace-pre" : "break-all"}`}>
        {text}
      </div>
      <Button type="secondary" size="small" className="shrink-0" onPress={copy}>{COPY_LABEL[state]}</Button>
    </div>
  </div>;
};

export const AssistantSettings = () => {
  const [info, setInfo] = useState<ConnectInfo | null>(null);

  useEffect(() => {
    if (!window.backend) return;
    let disposed = false;
    window.backend.invoke("assistant:connect-info")
      .then((value: ConnectInfo) => { if (!disposed) setInfo(value); })
      .catch((error: unknown) => console.error("[assistant] could not read the connection info:", error));
    return () => { disposed = true; };
  }, []);

  // Without the program's path there is nothing that would work to copy.
  if (!info?.command) return null;

  return <SidebarSection title="AI assistants">
    <Hint>
      {"Claude and other AI apps can search YouTube for videos in your language, check how many of their words you've saved, and open the one you pick here with subtitles. Miteiru needs to be open while they work."}
    </Hint>
    {info.warning && <div role="alert" className="rounded-lg bg-amber-500/15 px-2 py-1.5 text-xs text-amber-100">{info.warning}</div>}
    <CopyBox label="Claude Code" text={info.claudeCode}/>
    <CopyBox label="Other apps (MCP settings)" text={info.json} multiline/>
  </SidebarSection>;
};
