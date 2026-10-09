import React from "react";
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from "remotion";
import {beatPunch, C, clamp01, expoIn, pop, prog, shake} from "./anim";
import {JP_FONT, SC_FONT, TC_FONT, UI_FONT} from "./fonts";
import {AppWindow, Burst, CapCrop, Chip, Cursor, DarkBg, Flash, LightBg, Mascot, PopIn, Slam} from "./ui";

const H1: React.CSSProperties = {fontFamily: UI_FONT, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.02};

/* ---------- Bars 15–18: sixteen features, one per beat ---------- */

const Card: React.FC<{start: number; n: number; title: string; children: React.ReactNode; tilt: number}> = ({start, n, title, children, tilt}) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const s = pop(frame, start, {damping: 12, stiffness: 210});
  return (
    <div style={{width: 840, height: 440, borderRadius: 30, background: "#fff", border: "2px solid #bfdbfe", boxShadow: "0 8px 0 #bfdbfe, 0 40px 80px -30px rgba(15,30,74,0.45)", overflow: "hidden", transform: `scale(${0.55 + 0.45 * s}) rotate(${(1 - s) * tilt}deg)`, opacity: clamp01(s * 2.5)}}>
      <div style={{height: 76, background: C.butter, borderBottom: "2px solid #fde68a", display: "flex", alignItems: "center", gap: 18, padding: "0 26px"}}>
        <div style={{width: 46, height: 46, borderRadius: 14, background: C.navy, color: C.yellow, fontFamily: UI_FONT, fontWeight: 900, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center"}}>{String(n).padStart(2, "0")}</div>
        <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 40, color: C.navy}}>{title}</div>
      </div>
      <div style={{position: "relative", height: 364, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "linear-gradient(#f8fbff, #eaf2ff)"}}>{children}</div>
    </div>
  );
};

const Framed: React.FC<{children: React.ReactNode; dark?: boolean}> = ({children, dark}) => (
  <div style={{borderRadius: 18, overflow: "hidden", boxShadow: "0 14px 30px -14px rgba(15,30,74,0.5)", border: `2px solid ${dark ? "#1e293b" : "#dbeafe"}`, background: dark ? "#0b1020" : "#fff"}}>{children}</div>
);

const Small: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{fontFamily: UI_FONT, fontWeight: 700, fontSize: 26, color: "#475569", maxWidth: 740, textAlign: "center"}}>{children}</div>
);

const SEEK_LINES = [[1, 9, "今日はいい天気ですね。"], [10, 18, "一緒に公園へ行きませんか？"], [19, 28, "昨日、ケーキを食べてしまいました。"]] as const;

const SeekBarDemo: React.FC<{start: number}> = ({start}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - start);
  const DUR = 40;
  const W = 660;
  const progress = 0.22 + Math.min(local, 60) * 0.0012;
  const hover = 0.08 + 0.62 * Math.min(1, local / 70) + Math.sin(local / 9) * 0.02;
  const t = hover * DUR;
  const line = SEEK_LINES.find(([a, b]) => t >= a && t <= b);
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  return (
    <div style={{position: "relative", width: 740, height: 230, borderRadius: 22, background: "linear-gradient(to top, rgb(2 6 23), rgb(15 23 42 / 0.85))", boxShadow: "0 14px 30px -14px rgba(15,30,74,0.6)"}}>
      <div style={{position: "absolute", left: 40, top: 140, width: W, height: 10, borderRadius: 999, background: "rgb(255 255 255 / 0.16)", overflow: "hidden"}}>
        {SEEK_LINES.map(([a, b]) => <div key={a} style={{position: "absolute", left: (a / DUR) * W, width: ((b - a) / DUR) * W, top: 0, bottom: 0, background: "rgb(186 230 253 / 0.38)"}}/>)}
        <div style={{position: "absolute", left: 0, top: 0, bottom: 0, width: hover * W, background: "rgb(255 255 255 / 0.22)"}}/>
        <div style={{position: "absolute", left: 0, top: 0, bottom: 0, width: progress * W, background: "linear-gradient(90deg, #7dd3fc, #3b82f6)"}}/>
      </div>
      <div style={{position: "absolute", left: 40 + progress * W - 10, top: 135, width: 20, height: 20, borderRadius: 999, background: "#fff", boxShadow: "0 0 0 4px #3b82f6, 0 0 18px 3px rgba(59,130,246,0.75)"}}/>
      <div style={{position: "absolute", left: 40 + hover * W, top: 22, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 18px", borderRadius: 14, background: "rgb(15 23 42 / 0.95)", border: "1px solid rgb(255 255 255 / 0.14)", whiteSpace: "nowrap"}}>
        <span style={{fontFamily: UI_FONT, fontWeight: 800, fontSize: 22, color: "#7dd3fc"}}>{mm}:{ss}</span>
        {line && <span style={{fontFamily: JP_FONT, fontWeight: 600, fontSize: 24, color: "#fff"}}>{line[2]}</span>}
      </div>
      <div style={{position: "absolute", left: 40, top: 176, fontFamily: UI_FONT, fontWeight: 700, fontSize: 22, color: "rgb(255 255 255 / 0.7)"}}>00:{String(Math.floor(progress * DUR)).padStart(2, "0")} / 00:40</div>
      <Cursor x={40 + hover * W - 4} y={146}/>
    </div>
  );
};

const FEATURES: {title: string; body: (start: number) => React.ReactNode}[] = [
  {title: "Click any word", body: (s) => (
    <div style={{position: "relative"}}>
      <Framed><CapCrop crop="word_card" width={440}/></Framed>
      <Cursor x={250} y={160} clicks={[s + 10]}/>
    </div>
  )},
  {title: "Pitch accent", body: () => <Framed><CapCrop crop="pitch" width={700}/></Framed>},
  {title: "Every conjugation", body: () => <Framed><CapCrop crop="inflection" width={650}/></Framed>},
  {title: "Kanji, broken down", body: () => <Framed><CapCrop crop="kanji_info" width={760}/></Framed>},
  {title: "Colour what you know", body: () => <Framed dark><CapCrop crop="sub_learning" width={740}/></Framed>},
  {title: "Flashcards", body: () => <Framed><CapCrop crop={["flashcards", [960, 300, 1280, 620]]} width={640}/></Framed>},
  {title: "One-click Anki cards", body: () => (
    <>
      <Framed><CapCrop crop="quick_actions" width={760}/></Framed>
      <Chip bg={C.navy} color={C.yellow} style={{fontSize: 34}}>Export any word to Anki in one click</Chip>
    </>
  )},
  {title: "Karaoke lyrics", body: () => <Framed dark><CapCrop crop="karaoke" width={760}/></Framed>},
  {title: "Two subtitles at once", body: () => <AppWindow width={540} layers={[{name: "jp-playing", opacity: 1}]} chrome={false}/>},
  {title: "Every line on the seek bar", body: (s) => <SeekBarDemo start={s}/>},
  {title: "Settings in plain words", body: () => <Framed dark><CapCrop crop={["settings-subtitles", [2330, 420, 840, 440]]} width={600}/></Framed>},
  {title: "Fonts for every script", body: () => (
    <>
      <div style={{display: "flex", gap: 46}}>
        {[["JP", JP_FONT], ["SC", SC_FONT], ["TC", TC_FONT]].map(([k, f]) => (
          <div key={k} style={{textAlign: "center"}}>
            <div style={{fontFamily: f, fontWeight: 700, fontSize: 150, color: C.navy, lineHeight: 1.1}}>直</div>
            <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 30, color: C.blue}}>Noto Sans {k}</div>
          </div>
        ))}
      </div>
      <Small>The same character, drawn the way each language writes it.</Small>
    </>
  )},
  {title: "Local files & YouTube", body: () => (
    <>
      <div style={{display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", width: 720}}>
        {[".mkv", ".mp4", ".mov", ".srt", ".ass", ".vtt", ".lrc"].map((e) => <Chip key={e} bg="#fff" style={{fontSize: 36}}>{e}</Chip>)}
      </div>
      <Chip bg="#fee2e2" color="#991b1b" style={{fontSize: 36}}>
        <svg width="40" height="30" viewBox="0 0 40 30"><rect width="40" height="30" rx="8" fill="#dc2626"/><path d="M16 9 L27 15 L16 21 Z" fill="#fff"/></svg>
        Paste a YouTube link
      </Chip>
    </>
  )},
  {title: "AI translations", body: () => (
    <>
      <Framed><CapCrop crop="learn_toggles" width={680}/></Framed>
      <Small>Formal, neutral or casual, with notes · bring your own OpenRouter key</Small>
    </>
  )},
  {title: "Dictionaries, offline", body: () => (
    <div style={{display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", width: 740}}>
      {["JMdict", "KANJIDIC", "CC-CEDICT", "CantoDict", "VNEDict", "KanjiVG strokes"].map((d, i) => (
        <Chip key={d} bg={i % 2 ? C.butter : "#dbeafe"} style={{fontSize: 38}}>{d}</Chip>
      ))}
    </div>
  )},
  {title: "Sync with a GitHub Gist", body: () => <Framed dark><CapCrop crop="gist" width={460}/></Framed>},
];

export const Montage: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 15
  const bar = Math.min(3, Math.floor(frame / 96));
  const local = frame - bar * 96;
  const exit = bar < 3 ? prog(local, 88, 8, expoIn) : prog(local, 84, 12, expoIn);
  const enter = 1 - prog(local, 0, 8);
  return (
    <AbsoluteFill>
      <LightBg/>
      <AbsoluteFill style={{transform: `translateX(${enter * 500 - exit * 1900}px) scale(${beatPunch(frame, 0, 384, 0.02)})`, filter: `blur(${(enter + exit) * 14}px)`}}>
        {[0, 1, 2, 3].map((k) => {
          const n = bar * 4 + k;
          const f = FEATURES[n];
          const start = bar * 96 + k * 24;
          return (
            <div key={n} style={{position: "absolute", left: 100 + (k % 2) * 880, top: 80 + Math.floor(k / 2) * 480}}>
              <Card start={start} n={n + 1} title={f.title} tilt={k % 2 ? 6 : -6}>{f.body(start)}</Card>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- Bars 19–20: Free. Open source. Every platform. ---------- */

export const BuildFree: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = bar 19
  const roll = frame >= 96 ? Math.min(1, (frame - 96) / 80) : 0;
  const jx = Math.sin(frame * 2.3) * roll * 7;
  const jy = Math.cos(frame * 2.9) * roll * 5;
  if (frame >= 180) return <AbsoluteFill style={{background: "#03060f"}}/>;
  return (
    <AbsoluteFill>
      <DarkBg glow="rgba(253,224,71,0.25)"/>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", transform: `translate(${jx}px, ${jy}px)`}}>
        <Slam start={0} end={44} style={{...H1, fontSize: 330, color: C.yellow, textShadow: "0 16px 0 rgba(0,0,0,0.35)"}}>Free.</Slam>
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", transform: `translate(${jx}px, ${jy}px)`}}>
        <Slam start={48} end={92} style={{...H1, fontSize: 220, color: "#fff"}}>Open source.</Slam>
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", transform: `translate(${jx}px, ${jy}px)`}}>
        <div style={{display: "flex", gap: 60}}>
          {["Windows", "macOS", "Linux"].map((p, i) => (
            <Slam key={p} start={96 + i * 12} end={140} style={{...H1, fontSize: 150, color: i === 1 ? C.sky : "#fff"}}>{p}</Slam>
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", transform: `translate(${jx * 1.5}px, ${jy * 1.5}px)`}}>
        <Slam start={144} end={154} style={{...H1, fontSize: 200, color: "#fff"}}>4 languages.</Slam>
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: "center", justifyContent: "center", transform: `translate(${jx * 2}px, ${jy * 2}px)`}}>
        <Slam start={162} style={{...H1, fontSize: 230, color: C.yellow, marginTop: 0}} from={1.6}>{frame >= 162 ? "One player." : ""}</Slam>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- Bar 21: the end card ---------- */

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame(); // 0 = final impact
  const sh = shake(frame, 0, 24, 20);
  const logo = pop(frame, 0, {damping: 10, stiffness: 160});
  const word = pop(frame, 6, {damping: 10, stiffness: 200});
  const drift = 1 + frame * 0.00025;
  const titles = [["見ている", JP_FONT], ["在看", SC_FONT], ["睇緊", TC_FONT], ["đang xem", UI_FONT]] as const;
  return (
    <AbsoluteFill>
      <LightBg/>
      <Burst start={0} x={560} y={520} color={C.yellow} rays={16} length={650} dur={30}/>
      <AbsoluteFill style={{transform: `translate(${sh.x}px, ${sh.y}px) scale(${drift})`}}>
        <Img src={staticFile("logo.png")} style={{position: "absolute", left: 150, top: 170, width: 700, transform: `scale(${0.4 + 0.6 * logo}) rotate(${(1 - logo) * -12}deg)`, filter: "drop-shadow(0 30px 40px rgba(15,30,74,0.3))"}}/>
        <div style={{position: "absolute", left: 870, top: 210}}>
          <div style={{...H1, fontSize: 200, color: C.navy, transform: `scale(${0.4 + 0.6 * word})`, transformOrigin: "left center", textShadow: "0 10px 0 #bfdbfe"}}>Miteiru</div>
          <div style={{display: "flex", gap: 22, marginTop: 12, alignItems: "baseline"}}>
            {titles.map(([t, f], i) => (
              <PopIn key={t} start={24 + i * 6} from={0.6}>
                <span style={{fontFamily: f, fontWeight: 800, fontSize: 50, color: C.blue}}>{t}{i < 3 ? <span style={{color: "#93c5fd", marginLeft: 22}}>·</span> : null}</span>
              </PopIn>
            ))}
          </div>
          <PopIn start={48} from={0.7} style={{marginTop: 48, display: "flex", alignItems: "center", gap: 30}}>
            <div style={{padding: "20px 44px", borderRadius: 999, background: C.yellow, border: `4px solid ${C.navy}`, boxShadow: "0 8px 0 #0f1e4a", fontFamily: UI_FONT, fontWeight: 900, fontSize: 52, color: C.navy}}>Download free</div>
            <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 50, color: C.navy}}>miteiru.hocky.id</div>
          </PopIn>
          <PopIn start={72} from={0.8} style={{marginTop: 34}}>
            <div style={{fontFamily: UI_FONT, fontWeight: 800, fontSize: 36, color: "#334155"}}>Windows · macOS · Linux · v7.6.0</div>
            <div style={{fontFamily: UI_FONT, fontWeight: 800, fontSize: 32, color: C.blue5, marginTop: 8}}>Open source · github.com/hockyy/miteiru</div>
          </PopIn>
        </div>
      </AbsoluteFill>
      <div style={{position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", fontFamily: UI_FONT, fontWeight: 700, fontSize: 20, color: "#64748b", opacity: prog(frame, 110, 20)}}>
        Dictionary data: JMdict & KANJIDIC (EDRDG), CC-CEDICT, CantoDict, VNEDict · Stroke order: KanjiVG (CC BY-SA 3.0)
      </div>
      <div style={{position: "absolute", right: 60, bottom: 40, display: "flex", alignItems: "flex-end", gap: 10}}>
        <Mascot name="kiwi" start={30} height={190} bob={frame < 150 ? 16 : 0}/>
        <Mascot name="pome" start={36} height={200} bob={frame < 150 ? 16 : 0}/>
      </div>
      <Flash start={0} dur={14}/>
    </AbsoluteFill>
  );
};
