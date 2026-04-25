import React, {ReactNode} from "react";
import {ArrowLeft} from "./Icons";

interface SidebarShellProps {
  showSidebar: boolean;
  setShowSidebar: (updater: (value: boolean) => boolean) => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

export const SidebarSection = ({
  title,
  children
}: {
  title?: string;
  children: ReactNode;
}) => (
  <section className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20 backdrop-blur">
    {title && (
      <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-white/50">
        {title}
      </div>
    )}
    <div className="flex flex-col gap-3">
      {children}
    </div>
  </section>
);

export const SidebarSettingRow = ({
  children
}: {
  children: ReactNode;
}) => (
  <div className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm text-white/85">
    {children}
  </div>
);

export const SidebarShell = ({
  showSidebar,
  setShowSidebar,
  title = "Settings",
  subtitle,
  children
}: SidebarShellProps) => (
  <aside
    style={{
      transform: `translateX(${showSidebar ? "0" : "100%"})`
    }}
    className={[
      "fixed right-0 top-0 z-[19] h-screen w-[min(92vw,28rem)] overflow-y-auto overflow-x-hidden",
      "border-l border-white/10 bg-slate-950/85 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl",
      "transition-transform duration-300 ease-out"
    ].join(" ")}
  >
    <button
      type="button"
      className="mb-4 rounded-full border border-white/10 bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
      onClick={() => setShowSidebar((old) => !old)}
    >
      <div className="animation h-5">
        {ArrowLeft}
      </div>
    </button>

    <div className="mb-5">
      <div className="text-3xl font-black tracking-tight">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-white/55">{subtitle}</div>}
    </div>

    <div className="flex flex-col gap-4">
      {children}
    </div>
  </aside>
);
