import "@fontsource-variable/nunito/wght.css";
import "@fontsource-variable/noto-sans-jp/wght.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/noto-sans-tc/wght.css";
import {continueRender, delayRender} from "remotion";

export const UI_FONT = '"Nunito Variable", "Noto Sans JP Variable", sans-serif';
export const JP_FONT = '"Noto Sans JP Variable", "Nunito Variable", sans-serif';
export const SC_FONT = '"Noto Sans SC Variable", "Nunito Variable", sans-serif';
export const TC_FONT = '"Noto Sans TC Variable", "Nunito Variable", sans-serif';

// Every CJK glyph the video shows, so the unicode-range subsets that hold them load before frame 0.
const CJK_SAMPLE =
  "見ている今日はいい天気ですね一緒に公園へ行きませんか昨日ケーキを食べてしまいました食べる気分水晶" +
  "今天的天气很好真我们一起去公园吧今日天氣好好我哋一齊去公園啦在看睇緊日本語中文廣東話普通话" +
  "字語学話読聞あいうアカ音読み訓読みキケき直。、";

let loaded = false;
export const waitForFonts = () => {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  const families = [
    ["Nunito Variable", "Miteiru Learn Japanese ăâđêôơư ★"],
    ["Noto Sans JP Variable", CJK_SAMPLE],
    ["Noto Sans SC Variable", CJK_SAMPLE],
    ["Noto Sans TC Variable", CJK_SAMPLE],
  ];
  Promise.all(
    families.flatMap(([family, text]) =>
      [400, 700, 900].map((weight) => document.fonts.load(`${weight} 64px "${family}"`, text)),
    ),
  )
    .then(() => document.fonts.ready)
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
};
