import {useEffect, useState} from "react";

export const TOAST_TIMEOUT = 3000
/** Errors stay longer: there is something to read and understand. */
export const ERROR_TOAST_TIMEOUT = 7000

/** A button in the toast, such as Undo. */
export type ToastAction = {
  label: string;
  onPress: () => void;
}

export type ToastInfo = {
  message: string;
  update?: string;
  /** Marks an error; messages that start like one ("Failed to…", "Could not…") count as errors too. */
  error?: boolean;
  /** Milliseconds on screen; the default depends on whether it is an error or has an action. */
  duration?: number;
  action?: ToastAction;
}

const ERROR_START = /^\s*(error|failed|could not|couldn't|unable to|cannot|can't)/i;

/** How long a toast stays: errors and toasts with a button get 7 seconds, the rest 3. */
export const toastDuration = (info: ToastInfo): number => {
  if (info.duration !== undefined) return info.duration;
  return info.error || info.action || ERROR_START.test(info.message ?? '') ? ERROR_TOAST_TIMEOUT : TOAST_TIMEOUT;
}

export const Toast = ({info}: { info: ToastInfo }) => {
  const [lastToast, setLastToast] = useState(info)
  useEffect(() => {
    if (info.message === '') return;
    const timer = setTimeout(() => setLastToast(info), toastDuration(info));
    return () => clearTimeout(timer);
  }, [info])
  const visible = lastToast !== info;
  // Above the side panels (z-19) and the word popup (z-20); a status region, so a screen reader says it.
  return <div role="status" aria-live="polite" className="fixed right-3 top-3 z-[30]">
    {visible && <div
        className={"animation flex items-center gap-3 rounded-lg bg-gray-800 p-3 text-white unselectable"}>
      <span>{info.message}</span>
      {info.action && <button
          type="button"
          className="rounded-md border border-white/30 px-2 py-0.5 text-sm font-bold text-yellow-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60"
          onClick={() => {
            info.action?.onPress();
            setLastToast(info);
          }}>
        {info.action.label}
      </button>}
    </div>}
  </div>
}

export default Toast;
