import React from "react";
import {AbsoluteFill} from "remotion";
import {C} from "./anim";
import {JP_FONT, SC_FONT, TC_FONT, UI_FONT} from "./fonts";
import {AppWindow, LightBg, Marker, Mascot} from "./ui";

// The YouTube thumbnail: designed at 1920×1080, rendered at 1280×720 (--scale=0.6667).
export const Thumbnail: React.FC = () => (
  <AbsoluteFill>
    <LightBg/>
    <div style={{position: "absolute", left: 70, top: 250, transform: "rotate(-4deg)"}}>
      <AppWindow width={1020} layers={[{name: "jp-playing", opacity: 1}]}/>
    </div>
    <div style={{position: "absolute", left: 1130, top: 150, width: 760}}>
      <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 64, color: C.blue}}>Miteiru · 見ている</div>
      <div style={{fontFamily: UI_FONT, fontWeight: 900, fontSize: 132, lineHeight: 1.0, color: C.navy, letterSpacing: "-0.03em", marginTop: 14}}>
        Learn from <Marker start={-20}>what you</Marker> <Marker start={-20}>watch</Marker>
      </div>
      <div style={{display: "flex", flexWrap: "wrap", gap: 14, marginTop: 36}}>
        {[["日本語", JP_FONT, "#2563eb"], ["中文", SC_FONT, "#dc2626"], ["廣東話", TC_FONT, "#059669"], ["Tiếng Việt", UI_FONT, "#d97706"]].map(([t, f, c]) => (
          <div key={t} style={{padding: "10px 26px", borderRadius: 999, background: c, color: "#fff", fontFamily: f, fontWeight: 900, fontSize: 46, boxShadow: "0 6px 0 rgba(15,30,74,0.25)"}}>{t}</div>
        ))}
      </div>
      <div style={{marginTop: 34, display: "inline-block", padding: "12px 30px", borderRadius: 18, background: C.yellow, border: `4px solid ${C.navy}`, fontFamily: UI_FONT, fontWeight: 900, fontSize: 48, color: C.navy, boxShadow: "0 6px 0 #0f1e4a"}}>Free & open source</div>
    </div>
    <div style={{position: "absolute", left: 20, bottom: -30, display: "flex", alignItems: "flex-end"}}>
      <Mascot name="kiwi" start={-60} height={260}/>
      <Mascot name="pome" start={-60} height={280}/>
    </div>
  </AbsoluteFill>
);
