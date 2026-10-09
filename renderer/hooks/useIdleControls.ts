import {useEffect, useRef, useState} from "react";

// How long the mouse and keyboard can rest during playback before the controls fade, as on YouTube.
export const CONTROLS_IDLE_MS = 2500;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;

/**
 * Whether the player controls show. While a video plays they fade out once the mouse and keyboard
 * have been idle for CONTROLS_IDLE_MS, and any activity brings them back; they stay while paused,
 * while `enabled` is false (a panel is open) and while the mouse rests over the element given
 * `controlsRef`. While they are hidden the root element has `data-controls-idle`, which fades every
 * `.autohide` element and hides the cursor (globals.css).
 */
export const useIdleControls = <T extends HTMLElement>(playing: boolean, enabled: boolean) => {
  const [active, setActive] = useState(true);
  const controlsRef = useRef<T>(null);

  useEffect(() => {
    let timer: number | undefined;
    // Last mouse position in the window, or none once it has left.
    let pointer: { x: number; y: number } | null = null;
    const overControls = () => {
      const rect = controlsRef.current?.getBoundingClientRect();
      return Boolean(pointer && rect && rect.width > 0 &&
        pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom);
    };
    const arm = () => {
      window.clearTimeout(timer);
      // Hidden controls take no pointer events, so hovering them is judged by position.
      timer = window.setTimeout(() => (overControls() ? arm() : setActive(false)), CONTROLS_IDLE_MS);
    };
    const wake = (event: Event) => {
      if (event instanceof MouseEvent) {
        // Chromium sends mousemove without movement when the element under the cursor changes
        // (subtitle lines come and go), which must not count as activity.
        if (event.type === "mousemove" && pointer?.x === event.clientX && pointer?.y === event.clientY) return;
        pointer = {x: event.clientX, y: event.clientY};
      }
      setActive(true);
      arm();
    };
    const leave = () => {
      pointer = null;
    };
    arm();
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, wake, {passive: true, capture: true}));
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, wake, {capture: true}));
      document.documentElement.removeEventListener("mouseleave", leave);
    };
  }, []);

  const idle = playing && enabled && !active;
  useEffect(() => {
    document.documentElement.toggleAttribute("data-controls-idle", idle);
  }, [idle]);
  useEffect(() => () => document.documentElement.removeAttribute("data-controls-idle"), []);

  return {visible: !idle, controlsRef};
};
