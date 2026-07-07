import React, {ReactNode, RefObject} from "react";
import {ArrowLeft, ArrowRight, ArrowUp, ArrowDown} from "./Icons";

export const RIGHT_SIDEBAR_WIDTH = "min(92vw, 28rem)";
export const VOCAB_SIDEBAR_WIDTH = "min(92vw, 28rem)";

const SIDEBAR_PANEL_CLASS =
  "fixed top-0 z-[19] h-screen overflow-x-hidden overflow-y-auto border-white/10 bg-slate-950/85 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-300 ease-out";

export const SidebarIconButton = ({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={title}
    className="rounded-full border border-white/10 bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
    onClick={onClick}
  >
    <div className="animation h-5">{children}</div>
  </button>
);

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

/** Right-hand settings / learning panel (slides in from the right). */
export const SidebarShell = ({
  showSidebar,
  setShowSidebar,
  title = "Settings",
  subtitle,
  children
}: SidebarShellProps) => (
  <aside
    style={{
      transform: `translateX(${showSidebar ? "0" : "100%"})`,
      width: RIGHT_SIDEBAR_WIDTH,
    }}
    className={`${SIDEBAR_PANEL_CLASS} right-0 border-l`}
  >
    <SidebarIconButton onClick={() => setShowSidebar((old) => !old)} title="Close panel">
      {ArrowLeft}
    </SidebarIconButton>

    <div className="mb-5 mt-4">
      <div className="text-3xl font-black tracking-tight">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-white/55">{subtitle}</div>}
    </div>

    <div className="flex flex-col gap-4">
      {children}
    </div>
  </aside>
);

type LeftSidebarShellProps = {
  showSidebar: boolean;
  setShowSidebar: (updater: (value: boolean) => boolean) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  scrollRef?: RefObject<HTMLElement | null>;
  onScrollTop?: () => void;
  onScrollBottom?: () => void;
  width?: string;
};

/** Left-hand vocabulary panel (slides in from the left). */
export const LeftSidebarShell = ({
  showSidebar,
  setShowSidebar,
  title,
  subtitle,
  children,
  scrollRef,
  onScrollTop,
  onScrollBottom,
  width = VOCAB_SIDEBAR_WIDTH,
}: LeftSidebarShellProps) => (
  <aside
    ref={scrollRef}
    style={{
      transform: `translateX(${showSidebar ? "0" : "-100%"})`,
      width,
    }}
    className={`${SIDEBAR_PANEL_CLASS} left-0 border-r`}
  >
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur-xl">
      <SidebarIconButton
        onClick={() => setShowSidebar((old) => !old)}
        title="Close vocabulary list"
      >
        {ArrowRight}
      </SidebarIconButton>

      <div className="flex gap-2">
        {onScrollTop && (
          <SidebarIconButton onClick={onScrollTop} title="Scroll to top">
            {ArrowUp}
          </SidebarIconButton>
        )}
        {onScrollBottom && (
          <SidebarIconButton onClick={onScrollBottom} title="Scroll to bottom">
            {ArrowDown}
          </SidebarIconButton>
        )}
      </div>
    </div>

    <div className="mb-4">
      <div className="text-2xl font-black tracking-tight">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-white/55">{subtitle}</div>}
    </div>

    {children}
  </aside>
);
