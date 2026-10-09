import React from "react";
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from "remotion";
import {at, beatPunch, C, clamp01, expoIn, expoOut, lerp, pop, prog, shake} from "./anim";
import {JP_FONT, SC_FONT, TC_FONT, UI_FONT} from "./fonts";
import {Burst, DarkBg, Flash, LightBg, Marker, Mascot, Reveal, Slam, StrokeKanji} from "./ui";

const H1: React.CSSProperties = {fontFamily: UI_FONT, fontWeight: 900, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.02};

/* Bars 1–2: "Every day, you watch …anime / dramas / YouTube / vlogs" */
export const IntroWatch: React.FC = () => {
  const frame = useCurrentFrame();
  const slots = ["anime.", "dramas.", "YouTube.", "vlogs."];
  const exit = prog(frame, 186, 10, expoIn);
  return (
    <AbsoluteFill>
      <LightBg/>
      <AbsoluteFill style={{padding: "0 170px", justifyContent: "center", transform: `translateX(${-exit * 220}px)`, opacity: 1 - exit, filter: `blur(${exit * 8}px)`}}>
        <div style={{...H1, fontSize: 132}}>
          <Reveal start={4}>Every</Reveal>{" "}<Reveal start={16}>day,</Reveal>
        </div>
        <div style={{...H1, fontSize: 132, marginTop: 6}}>
          <Reveal start={48}>you</Reveal>{" "}<Reveal start={60}>watch</Reveal>
          <span style={{display: "inline-block", width: 18}}/>
          <Reveal start={72} style={{color: C.blue5}}>…</Reveal>
        </div>
        <div style={{position: "relative", height: 230, marginTop: 20}}>
          {slots.map((word, i) => (
            <div key={word} style={{position: "absolute", left: 0, top: 0}}>
              <Slam start={at(2, i)} end={i < 3 ? at(2, i + 1) - 2 : undefined} style={{...H1, fontSize: 210, color: C.blue, transformOrigin: "left center"}}>
                <Marker start={at(2, i) + 2}>{word}</Marker>
              </Slam>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <div style={{position: "absolute", right: 140, bottom: -30}}>
        <Mascot name="kiwi" start={at(2)} height={300} bob={18}/>
      </div>
    </AbsoluteFill>
  );
};

/* Bar 3: four languages, one per beat */
const LANGS = [
  {word: "日本語", en: "Japanese", font: JP_FONT, color: "#2563eb"},
  {word: "中文", en: "Mandarin", font: SC_FONT, color: "#dc2626"},
  {word: "廣東話", en: "Cantonese", font: TC_FONT, color: "#059669"},
  {word: "Tiếng Việt", en: "Vietnamese", font: UI_FONT, color: "#d97706"},
];

export const IntroLanguages: React.FC = () => {
  const frame = useCurrentFrame();
  const i = Math.min(3, Math.floor(frame / 24));
  const local = frame - i * 24;
  const lang = LANGS[i];
  const s = pop(frame, i * 24, {damping: 11, stiffness: 220});
  return (
    <AbsoluteFill>
      <LightBg glyphs={false}/>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center"}}>
        <div style={{position: "absolute", width: 760, height: 760, borderRadius: "50%", background: `radial-gradient(circle, ${lang.color}33, ${lang.color}00 65%)`, transform: `scale(${0.7 + 0.5 * prog(local, 0, 16)})`}}/>
        <div style={{...H1, fontSize: 58, color: C.blue5, position: "absolute", top: 250}}>
          <Reveal start={0}>in</Reveal>
        </div>
        <div style={{fontFamily: lang.font, fontWeight: 900, fontSize: 250, color: lang.color, transform: `scale(${0.6 + 0.4 * s}) translateY(${(1 - s) * 40}px)`, filter: `blur(${(1 - prog(local, 0, 6)) * 8}px)`, textShadow: "0 10px 0 rgba(15,30,74,0.12)"}}>{lang.word}</div>
        <div style={{...H1, fontSize: 52, color: C.navy, opacity: prog(local, 3, 8), marginTop: 10}}>{lang.en}</div>
        <div style={{position: "absolute", bottom: 150, display: "flex", gap: 22}}>
          {LANGS.map((l, j) => (
            <div key={l.en} style={{width: j === i ? 64 : 18, height: 18, borderRadius: 9, background: j <= i ? l.color : "rgba(15,30,74,0.15)", transition: "none"}}/>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* Bar 4: "But the subtitles just pass by." with a line drifting past */
export const IntroPassBy: React.FC = () => {
  const frame = useCurrentFrame();
  const x = lerp(frame, [0, 96], [1980, -1300], (t) => t);
  const fadeWords = prog(frame, 60, 30);
  return (
    <AbsoluteFill>
      <LightBg/>
      <AbsoluteFill style={{padding: "0 170px", paddingTop: 220}}>
        <div style={{...H1, fontSize: 120}}>
          <Reveal start={0}>But</Reveal>{" "}<Reveal start={8}>the</Reveal>{" "}<Reveal start={16}>subtitles</Reveal>
        </div>
        <div style={{...H1, fontSize: 120, marginTop: 4}}>
          <Reveal start={48}>just</Reveal>{" "}
          <Reveal start={60}><span style={{opacity: 1 - fadeWords * 0.75, letterSpacing: `${fadeWords * 0.08}em`, filter: `blur(${fadeWords * 3}px)`}}>pass by.</span></Reveal>
        </div>
      </AbsoluteFill>
      <div style={{position: "absolute", top: 690, left: x, padding: "16px 40px", borderRadius: 16, background: "rgba(10,15,30,0.78)", color: "#fff", fontFamily: JP_FONT, fontWeight: 700, fontSize: 64, whiteSpace: "nowrap", filter: "blur(1.5px)"}}>今日はいい天気ですね。</div>
      <div style={{position: "absolute", top: 830, left: x * 0.82 + 300, padding: "10px 30px", borderRadius: 12, background: "rgba(10,15,30,0.6)", color: "#fff", fontFamily: UI_FONT, fontWeight: 800, fontSize: 44, whiteSpace: "nowrap", opacity: 0.8, filter: "blur(2px)"}}>Nice weather today, isn't it?</div>
    </AbsoluteFill>
  );
};

/* Bars 5–6: push into the logo's TV while the question builds; the 見 is drawn in the gap. */
export const BuildQuestion: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 5
  const zoom = lerp(frame, [0, 168], [0.62, 7.5], expoIn);
  const darken = prog(frame, 0, 30);
  const words1 = [["What", 0], ["if", 24], ["every", 48], ["line", 72]] as const;
  const words2 = [["taught", 96], ["you", 120], ["something?", 144]] as const;
  const roll = frame >= 120 ? Math.sin(frame * 2.2) * Math.min(1, (frame - 120) / 40) * 6 : 0;
  const gap = frame >= 168;
  return (
    <AbsoluteFill>
      <DarkBg/>
      <AbsoluteFill style={{background: C.paper, opacity: 1 - darken}}/>
      {!gap && (
        <AbsoluteFill style={{alignItems: "center", justifyContent: "center"}}>
          {/* The 見 on the logo's TV sits at (72.8%, 26.4%); it drifts to the centre as we push in. */}
          <Img src={staticFile("logo.png")} style={{width: 760, transformOrigin: "72.8% 26.4%", transform: `translate(${-173 * prog(frame, 0, 168, expoIn)}px, ${179 * prog(frame, 0, 168, expoIn)}px) scale(${zoom})`, filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.45))"}}/>
        </AbsoluteFill>
      )}
      {!gap && (
        <AbsoluteFill style={{padding: "120px 150px", transform: `translate(${roll}px, ${roll * 0.6}px) scale(${beatPunch(frame, 96, 168, 0.04, frame >= 144 ? 6 : 12)})`}}>
          <div style={{...H1, color: "#fff", fontSize: 104, textShadow: "0 8px 30px rgba(0,0,0,0.5)"}}>
            {words1.map(([w, s]) => <React.Fragment key={w}><Reveal start={s}>{w}</Reveal>{" "}</React.Fragment>)}
          </div>
          <div style={{...H1, color: C.yellow, fontSize: 150, marginTop: 10, textShadow: "0 10px 40px rgba(0,0,0,0.6)"}}>
            {words2.map(([w, s]) => <React.Fragment key={w}><Reveal start={s} dur={10}>{w}</Reveal>{" "}</React.Fragment>)}
          </div>
        </AbsoluteFill>
      )}
      {gap && (
        <AbsoluteFill style={{background: "#03060f", alignItems: "center", justifyContent: "center"}}>
          <div style={{filter: "drop-shadow(0 0 30px rgba(125,211,252,0.9))", transform: `scale(${1 + (frame - 168) * 0.012})`}}>
            <StrokeKanji char="見" start={169} perStroke={3} size={560} color="#ffffff" active={C.sky} width={6}/>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* Bar 7: the drop. Wordmark, mascots, burst. */
export const DropLogo: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = drop
  const sh = shake(frame, 0, 26, 26);
  const word = pop(frame, 0, {damping: 9, stiffness: 200});
  const kana = pop(frame, 6, {damping: 10});
  const tag = prog(frame, 48, 16);
  const exit = prog(frame, 88, 8, expoIn);
  const punch = beatPunch(frame, 24, 96, 0.035);
  return (
    <AbsoluteFill style={{background: "radial-gradient(90% 90% at 50% 45%, #60a5fa 0%, #2563eb 45%, #1e3a8a 100%)", overflow: "hidden"}}>
      <AbsoluteFill style={{transform: `rotate(${frame * 0.25}deg) scale(1.6)`, opacity: 0.18}}>
        <svg width="1920" height="1080" viewBox="-960 -540 1920 1080">
          {Array.from({length: 18}, (_, i) => {
            const a = (i / 18) * Math.PI * 2;
            const b = a + Math.PI / 30;
            return <path key={i} d={`M0 0 L${Math.cos(a) * 1600} ${Math.sin(a) * 1600} L${Math.cos(b) * 1600} ${Math.sin(b) * 1600} Z`} fill="#fff"/>;
          })}
        </svg>
      </AbsoluteFill>
      <Burst start={0} x={960} y={500} color="#fde047" rays={16} length={700} dur={26}/>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", transform: `translate(${sh.x}px, ${sh.y - exit * 900}px) rotate(${sh.r}deg) scale(${punch})`}}>
        <div style={{fontFamily: JP_FONT, fontWeight: 900, fontSize: 96, color: C.yellow, letterSpacing: "0.12em", transform: `scale(${kana}) translateY(${(1 - kana) * 40}px)`, textShadow: "0 6px 0 #1e3a8a"}}>見ている</div>
        <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 250, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1, transform: `scale(${0.3 + 0.7 * word})`, textShadow: "0 14px 0 #1e3a8a, 0 30px 60px rgba(0,0,0,0.35)"}}>Miteiru</div>
        <div style={{fontFamily: UI_FONT, fontWeight: 800, fontSize: 50, color: "#e0f2fe", marginTop: 34, opacity: tag, transform: `translateY(${(1 - tag) * 30}px)`}}>
          Learn languages from the videos you love.
        </div>
      </AbsoluteFill>
      <div style={{position: "absolute", left: 110, bottom: -40, transform: `translateY(${exit * 500}px)`}}>
        <Mascot name="kiwi" start={4} height={420} bob={26}/>
      </div>
      <div style={{position: "absolute", right: 120, bottom: -40, transform: `translateY(${exit * 500}px)`}}>
        <Mascot name="pome" start={10} height={440} bob={26}/>
      </div>
      <Flash start={0} dur={14}/>
    </AbsoluteFill>
  );
};

export const introClamp = clamp01;
export const introEase = expoOut;
