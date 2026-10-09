import React from "react";
import {AbsoluteFill, Img, random, staticFile, useCurrentFrame} from "remotion";
import {getLength} from "@remotion/paths";
import {Scenery} from "./Scenery";
import {STROKES} from "./strokes";
import {C, clamp01, expoOut, pop, prog} from "./anim";
import {JP_FONT, UI_FONT} from "./fonts";
import CROPS from "./crops.json";

// Captures are 3200×1800: the app at 1600×900 CSS pixels, device scale 2.
export const CAP_W = 3200;
export const CAP_H = 1800;
export const CSS_W = 1600;

/* ---------- Backgrounds ---------- */

const GLYPHS = "見字語学話読聞あいうアカ日本中文廣東ăđêôơư気天食".split("");

const FloatingGlyphs: React.FC<{color: string; opacity: number; count?: number}> = ({color, opacity, count = 22}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      {Array.from({length: count}, (_, i) => {
        const x = random(`gx${i}`) * 1920;
        const size = 60 + random(`gs${i}`) * 140;
        const speed = 0.25 + random(`gv${i}`) * 0.6;
        const y = ((random(`gy${i}`) * 1300 - frame * speed) % 1300 + 1300) % 1300 - 160;
        const rot = (random(`gr${i}`) - 0.5) * 30 + Math.sin(frame / 60 + i) * 4;
        return (
          <div key={i} style={{
            position: "absolute", left: x, top: y, fontSize: size, fontFamily: JP_FONT, fontWeight: 900,
            color, opacity: opacity * (0.5 + random(`go${i}`) * 0.5), transform: `rotate(${rot}deg)`,
          }}>{GLYPHS[i % GLYPHS.length]}</div>
        );
      })}
    </AbsoluteFill>
  );
};

export const LightBg: React.FC<{glyphs?: boolean}> = ({glyphs = true}) => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  return (
    <AbsoluteFill style={{background: C.paper, overflow: "hidden"}}>
      <div style={{position: "absolute", width: 1100, height: 1100, borderRadius: "50%", left: -300 + Math.sin(t * 0.5) * 80, top: -420 + Math.cos(t * 0.4) * 60, background: "radial-gradient(circle, rgba(125,211,252,0.55), rgba(125,211,252,0) 65%)"}}/>
      <div style={{position: "absolute", width: 1000, height: 1000, borderRadius: "50%", right: -320 + Math.cos(t * 0.45) * 70, bottom: -460 + Math.sin(t * 0.35) * 60, background: "radial-gradient(circle, rgba(253,224,71,0.45), rgba(253,224,71,0) 65%)"}}/>
      <div style={{position: "absolute", width: 800, height: 800, borderRadius: "50%", right: 260 + Math.sin(t * 0.3) * 90, top: -380, background: "radial-gradient(circle, rgba(249,168,212,0.28), rgba(249,168,212,0) 65%)"}}/>
      <svg width="1920" height="1080" style={{position: "absolute", inset: 0}}>
        <defs>
          <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${(frame * 0.4) % 40})`}>
            <circle cx="20" cy="20" r="1.8" fill="rgba(30,58,138,0.13)"/>
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#dots)"/>
      </svg>
      {glyphs && <FloatingGlyphs color={C.blue} opacity={0.06}/>}
    </AbsoluteFill>
  );
};

export const DarkBg: React.FC<{glow?: string}> = ({glow = "rgba(59,130,246,0.45)"}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: "radial-gradient(120% 90% at 50% 40%, #13265e 0%, #0a1433 55%, #050a1c 100%)", overflow: "hidden"}}>
      <div style={{position: "absolute", width: 1400, height: 1400, left: 260, top: -300 + Math.sin(frame / 50) * 40, borderRadius: "50%", background: `radial-gradient(circle, ${glow}, rgba(0,0,0,0) 60%)`}}/>
      <FloatingGlyphs color="#ffffff" opacity={0.05}/>
    </AbsoluteFill>
  );
};

export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.07}) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 50;
  return (
    <AbsoluteFill style={{pointerEvents: "none", mixBlendMode: "overlay", opacity}}>
      <svg width="1920" height="1080">
        <filter id={`grain${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
        <rect width="1920" height="1080" filter={`url(#grain${seed})`}/>
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{strength?: number}> = ({strength = 0.35}) => (
  <AbsoluteFill style={{pointerEvents: "none", background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(5,10,28,${strength}) 100%)`}}/>
);

export const Flash: React.FC<{start: number; dur?: number; color?: string; peak?: number}> = ({start, dur = 12, color = "#fff", peak = 1}) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + dur) return null;
  return <AbsoluteFill style={{background: color, opacity: peak * (1 - (frame - start) / dur)}}/>;
};

/* ---------- Type ---------- */

/** A word that rises out of a mask. */
export const Reveal: React.FC<{start: number; children: React.ReactNode; dur?: number; style?: React.CSSProperties; delay?: number}> = ({start, children, dur = 16, style, delay = 0}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, start + delay, dur);
  return (
    <span style={{display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: "0.08em", ...style}}>
      <span style={{display: "inline-block", transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 6}deg)`, transformOrigin: "left bottom"}}>{children}</span>
    </span>
  );
};

/** A yellow highlighter swipe behind its children. */
export const Marker: React.FC<{start: number; children: React.ReactNode; color?: string; dur?: number}> = ({start, children, color = C.yellow, dur = 12}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, start, dur);
  return (
    <span style={{position: "relative", display: "inline-block"}}>
      <span style={{position: "absolute", left: "-0.08em", right: "-0.08em", bottom: "0.06em", height: "0.42em", background: color, borderRadius: "0.12em", transform: `scaleX(${p}) skewX(-8deg)`, transformOrigin: "left center", zIndex: 0}}/>
      <span style={{position: "relative", zIndex: 1}}>{children}</span>
    </span>
  );
};

/** A word that slams in (scale + blur) at `start` and leaves at `end`. */
export const Slam: React.FC<{start: number; end?: number; children: React.ReactNode; style?: React.CSSProperties; from?: number}> = ({start, end, children, style, from = 1.35}) => {
  const frame = useCurrentFrame();
  if (frame < start || (end !== undefined && frame >= end + 8)) return null;
  const p = prog(frame, start, 10);
  const out = end !== undefined ? prog(frame, end, 8) : 0;
  return (
    <div style={{
      transform: `scale(${from - (from - 1) * p}) translateY(${-out * 60}px)`,
      filter: `blur(${(1 - p) * 10 + out * 8}px)`,
      opacity: Math.min(p * 1.6, 1) * (1 - out),
      ...style,
    }}>{children}</div>
  );
};

export const Chip: React.FC<{children: React.ReactNode; bg?: string; color?: string; style?: React.CSSProperties}> = ({children, bg = C.butter, color = C.navy, style}) => (
  <div style={{display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 22px", borderRadius: 999, background: bg, color, fontFamily: UI_FONT, fontWeight: 800, fontSize: 30, border: "2px solid rgba(15,30,74,0.12)", boxShadow: "0 4px 0 rgba(15,30,74,0.12)", ...style}}>{children}</div>
);

/** A chip that pops in with a spring. */
export const PopIn: React.FC<{start: number; children: React.ReactNode; style?: React.CSSProperties; from?: number; rotate?: number}> = ({start, children, style, from = 0.4, rotate = 0}) => {
  const frame = useCurrentFrame();
  const s = pop(frame, start);
  if (frame < start) return null;
  return <div style={{transform: `scale(${from + (1 - from) * s}) rotate(${(1 - s) * rotate}deg)`, opacity: clamp01(s * 2), ...style}}>{children}</div>;
};

/* ---------- Real app captures ---------- */

export type CropKey = keyof typeof CROPS;

/** A rectangle of a capture, drawn `width` wide. */
export const CapCrop: React.FC<{crop: CropKey | [string, number[]]; width: number; style?: React.CSSProperties; radius?: number}> = ({crop, width, style, radius = 0}) => {
  const [name, rect] = (typeof crop === "string" ? CROPS[crop] : crop) as [string, number[]];
  const [x, y, w, h] = rect;
  const s = width / w;
  return (
    <div style={{position: "relative", width, height: h * s, overflow: "hidden", borderRadius: radius, ...style}}>
      <Img src={staticFile(`caps/${name}.png`)} style={{position: "absolute", left: -x * s, top: -y * s, width: CAP_W * s, height: CAP_H * s, maxWidth: "none"}}/>
    </div>
  );
};

export interface CapLayer {name: string; opacity: number; scale?: number; originX?: number; originY?: number; dy?: number}

/**
 * Miteiru in a window: the animated scenery plays where the video is and the real UI capture sits on
 * top. Children are drawn in content pixels (the capture's CSS pixels × width / 1600), under the camera.
 */
export const AppWindow: React.FC<{
  width: number;
  layers: CapLayer[];
  camera?: {scale: number; x: number; y: number};
  title?: string;
  children?: React.ReactNode;
  overlay?: React.ReactNode;
  chrome?: boolean;
  dim?: number;
}> = ({width, layers, camera = {scale: 1, x: 0, y: 0}, title = "Miteiru — scenery.mp4", children, overlay, chrome = true, dim = 0}) => {
  const height = (width * 9) / 16;
  const bar = chrome ? Math.round(width * 0.028) : 0;
  return (
    <div style={{width, borderRadius: Math.round(width * 0.014), overflow: "hidden", background: "#0b1020", boxShadow: "0 50px 120px -30px rgba(10,20,60,0.65), 0 0 0 1px rgba(255,255,255,0.08)"}}>
      {chrome && (
        <div style={{height: bar, display: "flex", alignItems: "center", gap: bar * 0.3, padding: `0 ${bar * 0.5}px`, background: "linear-gradient(#1b2440, #121a31)", borderBottom: "1px solid rgba(255,255,255,0.06)"}}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{width: bar * 0.3, height: bar * 0.3, borderRadius: "50%", background: c}}/>)}
          <div style={{flex: 1, textAlign: "center", color: "rgba(255,255,255,0.6)", fontFamily: UI_FONT, fontWeight: 700, fontSize: bar * 0.4, marginRight: bar * 1.5}}>{title}</div>
        </div>
      )}
      <div style={{position: "relative", width, height, overflow: "hidden"}}>
        <div style={{position: "absolute", inset: 0, transformOrigin: `${camera.x}px ${camera.y}px`, transform: `scale(${camera.scale})`}}>
          <Scenery/>
          {dim > 0 && <AbsoluteFill style={{background: `rgba(5,10,28,${dim})`}}/>}
          {layers.filter((l) => l.opacity > 0.001).map((l, i) => (
            <Img key={`${l.name}-${i}`} src={staticFile(`caps/${l.name}.png`)} style={{
              position: "absolute", left: 0, top: 0, width, height, opacity: l.opacity,
              transformOrigin: `${l.originX ?? width / 2}px ${l.originY ?? height / 2}px`,
              transform: `translateY(${l.dy ?? 0}px) scale(${l.scale ?? 1})`,
            }}/>
          ))}
          {children}
        </div>
        {overlay}
      </div>
    </div>
  );
};

/* ---------- Cursor, callouts, bursts ---------- */

export const Cursor: React.FC<{x: number; y: number; clicks?: number[]; scale?: number}> = ({x, y, clicks = [], scale = 1}) => {
  const frame = useCurrentFrame();
  const last = clicks.filter((c) => c <= frame).pop();
  const since = last === undefined ? 99 : frame - last;
  const press = since < 8 ? 1 - 0.18 * Math.sin((since / 8) * Math.PI) : 1;
  return (
    <div style={{position: "absolute", left: x, top: y, pointerEvents: "none", zIndex: 50}}>
      {since < 24 && (
        <div style={{position: "absolute", left: -40 * (0.3 + since / 24), top: -40 * (0.3 + since / 24), width: 80 * (0.3 + since / 24), height: 80 * (0.3 + since / 24), borderRadius: "50%", border: `${4 * (1 - since / 24)}px solid ${C.blue5}`, opacity: 1 - since / 24}}/>
      )}
      <svg width={44 * scale} height={52 * scale} viewBox="0 0 44 52" style={{transform: `scale(${press})`, transformOrigin: "0 0", filter: "drop-shadow(0 6px 10px rgba(10,20,60,0.45))"}}>
        <path d="M3 3 L3 40 L13 31 L20 47 L28 43 L21 28 L35 28 Z" fill="#fff" stroke={C.navy} strokeWidth="3" strokeLinejoin="round"/>
      </svg>
    </div>
  );
};

/** A label pill joined to a target point by a line that draws itself. */
export const Callout: React.FC<{start: number; tx: number; ty: number; lx: number; ly: number; label: string; color?: string; textColor?: string}> = ({start, tx, ty, lx, ly, label, color = C.yellow, textColor = C.navy}) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const line = prog(frame, start, 10);
  const s = pop(frame, start + 4);
  const dot = pop(frame, start, {damping: 10});
  return (
    <>
      <svg style={{position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none"}} width="1" height="1">
        <line x1={tx} y1={ty} x2={tx + (lx - tx) * line} y2={ty + (ly - ty) * line} stroke={color} strokeWidth="4" strokeLinecap="round"/>
        <circle cx={tx} cy={ty} r={9 * dot} fill={color} stroke={C.navy} strokeWidth="3"/>
      </svg>
      <div style={{position: "absolute", left: lx, top: ly, transform: `translate(-50%, -50%) scale(${s})`, padding: "10px 22px", borderRadius: 999, background: color, color: textColor, fontFamily: UI_FONT, fontWeight: 900, fontSize: 30, whiteSpace: "nowrap", boxShadow: "0 6px 0 rgba(15,30,74,0.25), 0 14px 30px -10px rgba(15,30,74,0.5)", border: `3px solid ${C.navy}`}}>{label}</div>
    </>
  );
};

export const Burst: React.FC<{start: number; x: number; y: number; color?: string; rays?: number; length?: number; dur?: number}> = ({start, x, y, color = "#fff", rays = 14, length = 420, dur = 22}) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + dur) return null;
  const p = (frame - start) / dur;
  const e = expoOut(p);
  return (
    <svg style={{position: "absolute", left: 0, top: 0, pointerEvents: "none"}} width="1920" height="1080">
      {Array.from({length: rays}, (_, i) => {
        const a = (i / rays) * Math.PI * 2 + 0.2;
        const r0 = 120 + e * length * 0.6;
        const r1 = 120 + e * length;
        return <line key={i} x1={x + Math.cos(a) * r0} y1={y + Math.sin(a) * r0} x2={x + Math.cos(a) * r1} y2={y + Math.sin(a) * r1} stroke={color} strokeWidth={10 * (1 - p)} strokeLinecap="round" opacity={1 - p}/>;
      })}
      <circle cx={x} cy={y} r={100 + e * length * 1.1} fill="none" stroke={color} strokeWidth={14 * (1 - p)} opacity={0.9 * (1 - p)}/>
    </svg>
  );
};

/* ---------- Kanji strokes (KanjiVG) ---------- */

export const StrokeKanji: React.FC<{char: string; start: number; perStroke: number; size: number; color?: string; active?: string; width?: number; numbers?: boolean}> = ({char, start, perStroke, size, color = C.navy, active = C.blue5, width = 5, numbers = false}) => {
  const frame = useCurrentFrame();
  const paths = STROKES[char] ?? [];
  return (
    <svg width={size} height={size} viewBox="0 0 109 109">
      {paths.map((d, i) => {
        const len = getLength(d);
        const t = clamp01((frame - (start + i * perStroke)) / (perStroke * 1.25));
        const drawing = t > 0 && t < 1;
        return <path key={i} d={d} fill="none" stroke={drawing ? active : color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - expoOut(t))}/>;
      })}
      {numbers && paths.map((d, i) => {
        const m = /M([\d.]+),([\d.]+)/.exec(d);
        if (!m || frame < start + i * perStroke) return null;
        return <text key={`n${i}`} x={Number(m[1]) - 6} y={Number(m[2]) - 2} fontSize="7" fill={C.red} fontFamily={UI_FONT} fontWeight={800}>{i + 1}</text>;
      })}
    </svg>
  );
};

export const Mascot: React.FC<{name: "kiwi" | "pome"; start: number; height: number; bob?: number; style?: React.CSSProperties; flip?: boolean}> = ({name, start, height, bob = 0, style, flip}) => {
  const frame = useCurrentFrame();
  const s = pop(frame, start, {damping: 9, stiffness: 140});
  if (frame < start) return null;
  const beat = ((frame - start) % 24) / 24;
  const hop = bob * Math.abs(Math.sin(beat * Math.PI));
  return (
    <Img src={staticFile(`${name}.png`)} style={{
      height, transform: `translateY(${(1 - s) * 300 - hop}px) rotate(${(1 - s) * (flip ? 25 : -25) + Math.sin(frame / 9) * 3}deg) scaleX(${flip ? -1 : 1})`,
      filter: "drop-shadow(0 18px 24px rgba(15,30,74,0.35))", ...style,
    }}/>
  );
};
