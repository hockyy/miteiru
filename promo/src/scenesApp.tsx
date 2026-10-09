import React from "react";
import {AbsoluteFill, useCurrentFrame} from "remotion";
import {beatPunch, C, clamp01, expoIn, expoInOut, expoOut, lerp, pop, prog} from "./anim";
import {JP_FONT, SC_FONT, TC_FONT, UI_FONT} from "./fonts";
import {Scenery} from "./Scenery";
import CROPS from "./crops.json";
import {AppWindow, Callout, CapCrop, Chip, Cursor, Flash, LightBg, PopIn, Reveal, StrokeKanji} from "./ui";

const H1: React.CSSProperties = {fontFamily: UI_FONT, fontWeight: 900, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.05};

// The app window for the tour: 1500 wide, capture CSS pixels × 0.9375.
const WIN = 1500;
const K = WIN / 1600;
const css = (x: number, y: number) => [x * K, y * K] as const;

/** Cursor path: [frame, x, y] keyframes in content pixels, eased between. */
const cursorAt = (frame: number, keys: [number, number, number][]) => {
  if (frame <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    const [f1, x1, y1] = keys[i];
    const [f0, x0, y0] = keys[i - 1];
    if (frame <= f1) {
      const t = expoInOut(clamp01((frame - f0) / (f1 - f0)));
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
  }
  const last = keys[keys.length - 1];
  return [last[1], last[2]];
};

/* Bars 8–10: the real app. Callouts, a click on 天気, the dictionary, pitch accent, then 気. */
export const AppTour: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 8
  const enter = pop(frame, 0, {damping: 16, stiffness: 120, mass: 0.9});
  const CLICK1 = 144;
  const CLICK2 = 240;

  const meaning = prog(frame, CLICK1, 7);
  const meaning2 = prog(frame, 192, 8);
  const kanji = prog(frame, CLICK2, 7);
  const layers = [
    {name: "jp-playing", opacity: 1 - meaning},
    {name: "jp-meaning", opacity: meaning * (1 - meaning2), scale: 0.94 + 0.06 * pop(frame, CLICK1, {damping: 13}), originX: 750, originY: 422},
    {name: "jp-meaning-2", opacity: meaning2 * (1 - kanji), dy: (1 - meaning2) * 70},
    {name: "jp-kanji", opacity: kanji, scale: 0.95 + 0.05 * pop(frame, CLICK2, {damping: 13}), originX: 750, originY: 300},
  ];

  // Camera: the dictionary, back out, then into the stroke order and through it.
  const [dx, dy] = css(500, 450);
  const [sx, sy] = css(336, 568);
  let camera = {scale: 1, x: dx, y: dy};
  if (frame >= 150 && frame < 196) camera = {scale: lerp(frame, [154, 172, 188, 196], [1, 1.45, 1.45, 1], expoInOut), x: dx, y: dy};
  if (frame >= 256) camera = {scale: lerp(frame, [262, 278, 288], [1, 1.7, 4.2], expoIn), x: sx, y: sy};

  const [cx, cy] = cursorAt(frame, [
    [96, 1340, 760], [138, ...css(830, 100)], [150, ...css(830, 100)], [176, 1150, 640],
    [206, 1150, 640], [234, ...css(822, 215)], [250, ...css(822, 215)], [270, 1300, 760],
  ]);
  const calloutsOut = 1 - prog(frame, 134, 6);
  const [wx0, wx1] = css(273, 335);
  const [, wy] = css(0, 436);

  return (
    <AbsoluteFill>
      <LightBg/>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", perspective: 2200}}>
        <div style={{transform: `translateY(${(1 - enter) * 760}px) rotateX(${(1 - enter) * 30}deg) scale(${(0.82 + 0.18 * enter) * beatPunch(frame, 24, 96, 0.012)})`, transformOrigin: "50% 100%"}}>
          <AppWindow width={WIN} layers={layers} camera={camera}>
            <div style={{opacity: calloutsOut}}>
              <Callout start={32} tx={css(541, 33)[0]} ty={css(541, 33)[1]} lx={230} ly={40} label="Furigana"/>
              <Callout start={48} tx={css(520, 150)[0]} ty={css(520, 150)[1]} lx={230} ly={130} label="Romaji"/>
              <Callout start={64} tx={css(515, 182)[0]} ty={css(515, 182)[1]} lx={230} ly={222} label="Meanings"/>
              <Callout start={80} tx={css(800, 742)[0]} ty={css(800, 742)[1]} lx={750} ly={600} label="Your translation" color={C.sky}/>
            </div>
            {frame >= 178 && frame < 194 && (
              <div style={{position: "absolute", left: wx0 - 6, top: wy - 4, width: (wx1 - wx0 + 12) * prog(frame, 178, 8), height: 22, background: "rgba(253,224,71,0.55)", borderRadius: 6, mixBlendMode: "multiply"}}/>
            )}
            {frame >= 200 && frame < 238 && (
              <Callout start={200} tx={css(304, 690)[0]} ty={css(304, 690)[1]} lx={700} ly={600} label="Pitch accent"/>
            )}
            {frame >= 96 && frame < 276 && <Cursor x={cx} y={cy} clicks={[CLICK1, CLICK2]}/>}
          </AppWindow>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: "#fff", opacity: prog(frame, 280, 8)}}/>
    </AbsoluteFill>
  );
};

/* Bar 11: 気, stroke by stroke, with what Miteiru knows about it. */
export const StrokeScene: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 11
  const exit = prog(frame, 88, 8, expoIn);
  const card = pop(frame, 0, {damping: 14});
  const chips: [number, string, string, string][] = [
    [24, "JLPT N4", C.red, "#fff"],
    [32, "Grade 1", C.red, "#fff"],
    [40, "6 strokes", C.red, "#fff"],
    [48, "Top 113 kanji", C.red, "#fff"],
  ];
  return (
    <AbsoluteFill>
      <LightBg/>
      <Flash start={0} dur={10}/>
      <AbsoluteFill style={{transform: `translateX(${-exit * 400}px)`, opacity: 1 - exit}}>
        <div style={{position: "absolute", left: 190, top: 190, width: 660, height: 660, borderRadius: 40, background: "#fff", border: "2px solid #bfdbfe", boxShadow: "0 10px 0 #bfdbfe, 0 40px 90px -30px rgba(15,30,74,0.45)", transform: `scale(${0.7 + 0.3 * card}) rotate(${(1 - card) * -6}deg)`}}>
          <svg width="660" height="660" style={{position: "absolute", inset: 0}}>
            <line x1="330" y1="40" x2="330" y2="620" stroke="#fca5a5" strokeWidth="3" strokeDasharray="14 12"/>
            <line x1="40" y1="330" x2="620" y2="330" stroke="#fca5a5" strokeWidth="3" strokeDasharray="14 12"/>
            <rect x="40" y="40" width="580" height="580" fill="none" stroke="#fecaca" strokeWidth="3" rx="20"/>
          </svg>
          <div style={{position: "absolute", left: 40, top: 40}}>
            <StrokeKanji char="気" start={6} perStroke={8} size={580} numbers width={5.5}/>
          </div>
        </div>
        <div style={{position: "absolute", left: 960, top: 210, width: 860}}>
          <div style={{...H1, fontSize: 84}}>
            <Reveal start={0}>Every</Reveal> <Reveal start={6}>kanji,</Reveal>
          </div>
          <div style={{...H1, fontSize: 84, color: C.blue}}>
            <Reveal start={12}>broken</Reveal> <Reveal start={18}>down.</Reveal>
          </div>
          <div style={{display: "flex", flexWrap: "wrap", gap: 16, marginTop: 40}}>
            {chips.map(([s, label, bg, color]) => (
              <PopIn key={label} start={s} rotate={-8}><Chip bg={bg} color={color} style={{fontSize: 30, border: "none"}}>{label}</Chip></PopIn>
            ))}
          </div>
          <div style={{display: "flex", flexWrap: "wrap", gap: 14, marginTop: 26}}>
            {["spirit", "mind", "air", "atmosphere", "mood"].map((m, i) => (
              <PopIn key={m} start={60 + i * 3}><Chip bg="#fee2e2" color="#991b1b" style={{fontSize: 30}}>{m}</Chip></PopIn>
            ))}
          </div>
          <PopIn start={76} from={0.8}>
            <div style={{marginTop: 30, fontFamily: JP_FONT, fontWeight: 800, fontSize: 40, color: C.navy}}>
              <span style={{color: "#b91c1c"}}>音読み</span> キ · ケ&nbsp;&nbsp;&nbsp;<span style={{color: "#b91c1c"}}>訓読み</span> き
            </div>
          </PopIn>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Bar 12: 食べてしまいました joins into one word, looked up as 食べる, with its inflection table. */
export const VerbScene: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 12
  const parts = [["食べ", "ta be"], ["て", "te"], ["しまい", "shimai"], ["まし", "mashi"], ["た", "ta"]];
  const join = pop(frame, 24, {damping: 13, stiffness: 200});
  const gapPx = 46 * (1 - join);
  const box = pop(frame, 26, {damping: 12});
  const arrow = prog(frame, 48, 10);
  const exit = prog(frame, 90, 6, expoIn);
  return (
    <AbsoluteFill>
      <LightBg/>
      <AbsoluteFill style={{opacity: 1 - exit, transform: `scale(${1 + exit * 0.15})`, filter: `blur(${exit * 10}px)`}}>
        <div style={{position: "absolute", left: 130, top: 90, ...H1, fontSize: 76}}>
          <Reveal start={0}>Verbs</Reveal> <Reveal start={6}>stay</Reveal> <Reveal start={12} style={{color: C.blue}}>whole.</Reveal>
        </div>
        <div style={{position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center"}}>
          <div style={{position: "relative", display: "flex", gap: gapPx, padding: "18px 34px"}}>
            <div style={{position: "absolute", inset: 0, borderRadius: 28, background: C.yellow, border: `4px solid ${C.navy}`, boxShadow: "0 8px 0 rgba(15,30,74,0.25)", transform: `scaleX(${box})`, opacity: clamp01(box * 2)}}/>
            {parts.map(([jp, ro], i) => {
              const s = pop(frame, 2 + i * 3, {damping: 12});
              return (
                <div key={jp} style={{position: "relative", textAlign: "center", transform: `translateY(${(1 - s) * 40}px)`, opacity: clamp01(s * 2)}}>
                  <div style={{fontFamily: JP_FONT, fontWeight: 900, fontSize: 120, color: C.navy, padding: "0 6px", borderRadius: 16, border: `3px dashed rgba(15,30,74,${0.35 * (1 - join)})`}}>{jp}</div>
                  <div style={{fontFamily: UI_FONT, fontWeight: 800, fontSize: 36, color: "#a16207"}}>{ro}</div>
                </div>
              );
            })}
          </div>
        </div>
        <svg width="1920" height="1080" style={{position: "absolute", inset: 0}}>
          <path d="M700 500 C 640 560, 560 580, 520 640" fill="none" stroke={C.navy} strokeWidth="7" strokeLinecap="round" strokeDasharray="260" strokeDashoffset={260 * (1 - arrow)}/>
          {arrow > 0.95 && <path d="M500 615 L520 646 L548 624" fill="none" stroke={C.navy} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>}
        </svg>
        <PopIn start={56} style={{position: "absolute", left: 200, top: 670}}>
          <div style={{background: "#fff", borderRadius: 32, padding: "26px 44px", border: "2px solid #bfdbfe", boxShadow: "0 8px 0 #bfdbfe, 0 30px 60px -24px rgba(15,30,74,0.4)"}}>
            <div style={{fontFamily: UI_FONT, fontWeight: 800, fontSize: 26, color: C.blue5}}>Dictionary form</div>
            <div style={{display: "flex", alignItems: "baseline", gap: 26}}>
              <div style={{fontFamily: JP_FONT, fontWeight: 900, fontSize: 110, color: C.navy}}>食べる</div>
              <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 52, color: C.red}}>to eat</div>
            </div>
          </div>
        </PopIn>
        <PopIn start={72} from={0.7} style={{position: "absolute", left: 930, top: 560}}>
          <div style={{background: "#fff", borderRadius: 28, padding: 18, border: "2px solid #bfdbfe", boxShadow: "0 8px 0 #bfdbfe, 0 30px 60px -24px rgba(15,30,74,0.4)"}}>
            <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 30, color: C.navy, padding: "4px 10px 12px"}}>15 forms, and when to use them</div>
            <CapCrop crop="inflection" width={820} radius={14}/>
          </div>
        </PopIn>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Bar 13: one subtitle, four languages, one per beat (real captures). */
const MORPH = [
  {crop: "sub_ja", name: "日本語", en: "Japanese", how: "furigana · romaji · meanings", font: JP_FONT, color: "#2563eb"},
  {crop: "sub_zh", name: "普通话", en: "Mandarin", how: "pinyin · meanings", font: SC_FONT, color: "#dc2626"},
  {crop: "sub_yue", name: "廣東話", en: "Cantonese", how: "jyutping · meanings", font: TC_FONT, color: "#059669"},
  {crop: "sub_vi", name: "Tiếng Việt", en: "Vietnamese", how: "meanings under every word", font: UI_FONT, color: "#d97706"},
] as const;

export const LanguageMorph: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 13
  const i = Math.min(3, Math.floor(frame / 24));
  const local = frame - i * 24;
  const m = MORPH[i];
  const [, rect] = CROPS[m.crop] as [string, number[]];
  const S = 1920 / 3200; // the app full screen: capture pixels × 0.6
  const flip = prog(local, 0, 9);
  const en = CROPS.sub_en[1] as number[];
  return (
    <AbsoluteFill>
      <Scenery/>
      <AbsoluteFill style={{background: "rgba(5,10,28,0.12)"}}/>
      <div style={{position: "absolute", left: rect[0] * S, top: rect[1] * S + 40, perspective: 1400}}>
        <div style={{transform: `rotateX(${(1 - flip) * 95}deg) scale(${1.15 - 0.15 * flip})`, transformOrigin: "50% 0%", opacity: clamp01(flip * 1.5)}}>
          <CapCrop crop={m.crop} width={rect[2] * S} radius={10}/>
        </div>
      </div>
      <div style={{position: "absolute", left: en[0] * S, top: en[1] * S}}>
        <CapCrop crop="sub_en" width={en[2] * S} radius={10}/>
      </div>
      <div style={{position: "absolute", left: 0, right: 0, top: 470, display: "flex", justifyContent: "center"}}>
        <div style={{display: "flex", alignItems: "center", gap: 26, padding: "18px 40px", borderRadius: 999, background: "#fff", border: `4px solid ${m.color}`, boxShadow: "0 10px 0 rgba(15,30,74,0.2)", transform: `scale(${0.7 + 0.3 * pop(local, 0, {damping: 11, stiffness: 240})})`}}>
          <span style={{fontFamily: m.font, fontWeight: 900, fontSize: 64, color: m.color}}>{m.name}</span>
          <span style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 44, color: C.navy}}>{m.en}</span>
          <span style={{fontFamily: UI_FONT, fontWeight: 700, fontSize: 32, color: "#475569"}}>{m.how}</span>
        </div>
      </div>
      <Flash start={i * 24} dur={6} peak={0.35}/>
    </AbsoluteFill>
  );
};

/* Bar 14: all four, side by side. */
export const LanguageGrid: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 14
  const caps = [["jp-playing", "日本語", JP_FONT, "#2563eb"], ["zh-playing", "普通话", SC_FONT, "#dc2626"], ["yue-playing", "廣東話", TC_FONT, "#059669"], ["vi-playing", "Tiếng Việt", UI_FONT, "#d97706"]] as const;
  const out = prog(frame, 76, 20, expoIn);
  return (
    <AbsoluteFill>
      <LightBg/>
      <AbsoluteFill style={{transform: `scale(${1 + out * 0.5})`, filter: `blur(${out * 14}px)`, opacity: 1 - out * 0.6}}>
        {caps.map(([name, label, font, color], i) => {
          const s = pop(frame, i * 24, {damping: 12, stiffness: 180});
          const x = 110 + (i % 2) * 880;
          const y = 40 + Math.floor(i / 2) * 520;
          return (
            <div key={name} style={{position: "absolute", left: x, top: y, transform: `scale(${0.5 + 0.5 * s}) rotate(${(1 - s) * (i % 2 ? 7 : -7)}deg)`, opacity: clamp01(s * 2)}}>
              <AppWindow width={820} layers={[{name, opacity: 1}]} title={`Miteiru — ${label}`}/>
              <div style={{position: "absolute", left: 24, bottom: 24, padding: "8px 24px", borderRadius: 999, background: color, color: "#fff", fontFamily: font, fontWeight: 900, fontSize: 40, boxShadow: "0 6px 0 rgba(0,0,0,0.25)"}}>{label}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{background: "#fff", opacity: prog(frame, 88, 8)}}/>
    </AbsoluteFill>
  );
};

export const appEase = expoOut;
