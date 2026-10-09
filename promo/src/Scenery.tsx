import React from "react";
import {AbsoluteFill, random, useCurrentFrame, useVideoConfig} from "remotion";

// An original, gently animated landscape in the style of the TV in Miteiru's logo:
// pale sky, soft clouds, layered green hills and a winding river. Used as the "video" playing in the app.

const Cloud: React.FC<{x: number; y: number; s: number; o?: number}> = ({x, y, s, o = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <ellipse cx="0" cy="20" rx="120" ry="38" fill="#ffffff" />
    <circle cx="-50" cy="0" r="46" fill="#ffffff" />
    <circle cx="10" cy="-18" r="60" fill="#ffffff" />
    <circle cx="70" cy="4" r="42" fill="#ffffff" />
    <ellipse cx="0" cy="34" rx="118" ry="16" fill="#e0f2fe" opacity="0.8" />
  </g>
);

const Tree: React.FC<{x: number; y: number; s: number; c: string}> = ({x, y, s, c}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-5" y="-6" width="10" height="34" rx="4" fill="#92400e" />
    <circle cx="0" cy="-30" r="30" fill={c} />
    <circle cx="-18" cy="-14" r="20" fill={c} />
    <circle cx="18" cy="-12" r="22" fill={c} />
    <circle cx="-8" cy="-40" r="12" fill="#ffffff" opacity="0.18" />
  </g>
);

export const Scenery: React.FC<{tint?: number}> = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const cloudX = (base: number, speed: number) => ((base + t * speed + 400) % 2400) - 400;
  const birds = [0, 1, 2].map((i) => {
    const bx = ((t * 70 + i * 90) % 2300) - 200;
    const by = 230 + i * 26 + Math.sin(t * 2 + i) * 8;
    const flap = Math.sin(t * 9 + i * 1.7) * 9;
    return {bx, by, flap};
  });

  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.55" stopColor="#bae6fd" />
            <stop offset="1" stopColor="#f0f9ff" />
          </linearGradient>
          <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fef9c3" />
            <stop offset="0.45" stopColor="#fde68a" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="river" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
          <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a7f3d0" />
            <stop offset="1" stopColor="#6ee7b7" />
          </linearGradient>
          <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#86efac" />
            <stop offset="1" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="hillNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4ade80" />
            <stop offset="1" stopColor="#16a34a" />
          </linearGradient>
        </defs>

        <rect width="1920" height="1080" fill="url(#sky)" />
        <circle cx={1480} cy={250 + Math.sin(t * 0.3) * 6} r={260} fill="url(#sun)" />
        <circle cx={1480} cy={250 + Math.sin(t * 0.3) * 6} r={92} fill="#fef3c7" />

        <Cloud x={cloudX(200, 18)} y={180} s={1.2} />
        <Cloud x={cloudX(900, 12)} y={120} s={0.8} o={0.9} />
        <Cloud x={cloudX(1500, 22)} y={330} s={1} o={0.95} />
        <Cloud x={cloudX(2100, 9)} y={90} s={0.6} o={0.8} />

        {birds.map(({bx, by, flap}, i) => (
          <path
            key={i}
            d={`M ${bx - 16} ${by - flap} Q ${bx - 8} ${by - 4} ${bx} ${by} Q ${bx + 8} ${by - 4} ${bx + 16} ${by - flap}`}
            stroke="#1e3a8a"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            opacity="0.7"
          />
        ))}

        {/* distant mountains */}
        <path d="M0 640 L220 470 L360 560 L560 400 L760 560 L940 450 L1160 600 L1380 480 L1600 590 L1800 500 L1920 560 L1920 1080 L0 1080 Z" fill="#c7d2fe" />
        <path d="M560 400 L610 440 L585 450 L560 432 L540 452 L515 440 Z" fill="#ffffff" opacity="0.9" />
        <path d="M1380 480 L1420 512 L1398 520 L1380 506 L1362 522 L1340 510 Z" fill="#ffffff" opacity="0.9" />

        <path d="M0 700 C 240 600, 460 620, 700 680 S 1180 600, 1420 650 S 1780 640, 1920 620 L1920 1080 L0 1080 Z" fill="url(#hillFar)" />
        <path d="M0 790 C 300 700, 560 730, 860 780 S 1400 720, 1920 760 L1920 1080 L0 1080 Z" fill="url(#hillMid)" />

        <path d="M0 900 C 260 820, 520 860, 760 900 S 1200 1000, 1920 880 L1920 1080 L0 1080 Z" fill="url(#hillNear)" />

        {/* river */}
        <path
          d="M1024 690 C 990 760, 1070 800, 1030 860 S 820 960, 860 1080 L 1220 1080 C 1140 980, 1230 900, 1180 850 S 1050 760, 1030 690 Z"
          fill="url(#river)"
        />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const phase = (t * 0.6 + i / 6) % 1;
          const y = 720 + phase * 340;
          const x = 1030 + Math.sin(phase * 6 + i) * 40 + phase * 20;
          return (
            <path
              key={i}
              d={`M ${x - 20 - phase * 30} ${y} q ${20 + phase * 30} -6 ${40 + phase * 60} 0`}
              stroke="#ffffff"
              strokeWidth={3 + phase * 3}
              strokeLinecap="round"
              fill="none"
              opacity={0.7 * Math.sin(phase * Math.PI)}
            />
          );
        })}

        {[
          [180, 820, 1.1, "#22c55e"],
          [300, 845, 0.8, "#16a34a"],
          [1550, 800, 1.2, "#22c55e"],
          [1680, 830, 0.9, "#15803d"],
          [1780, 810, 1, "#16a34a"],
          [640, 860, 0.7, "#15803d"],
        ].map(([x, y, s, c], i) => (
          <g key={i} transform={`rotate(${Math.sin(t * 1.4 + i) * 1.2} ${x} ${Number(y) + 28})`}>
            <Tree x={Number(x)} y={Number(y)} s={Number(s)} c={String(c)} />
          </g>
        ))}

        {/* flowers on the near hill */}
        {Array.from({length: 26}, (_, i) => {
          const x = random(`fx${i}`) * 1920;
          const y = 960 + random(`fy${i}`) * 110;
          const c = ["#fda4af", "#fde047", "#ffffff", "#f9a8d4"][i % 4];
          return <circle key={i} cx={x} cy={y} r={5 + random(`fr${i}`) * 4} fill={c} opacity="0.9" />;
        })}
      </svg>
    </AbsoluteFill>
  );
};
