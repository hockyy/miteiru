import React from "react";
import {AbsoluteFill, Audio, Sequence, staticFile} from "remotion";
import {at} from "./anim";
import {Grain, Vignette} from "./ui";
import {BuildQuestion, DropLogo, IntroLanguages, IntroPassBy, IntroWatch} from "./scenesIntro";
import {AppTour, LanguageGrid, LanguageMorph, StrokeScene, VerbScene} from "./scenesApp";
import {BuildFree, EndCard, Montage} from "./scenesOutro";

// Scenes on the music's grid (bar 1 starts at frame 0; one bar is 96 frames).
const SCENES: [React.FC, number, number][] = [
  [IntroWatch, at(1), 192],
  [IntroLanguages, at(3), 96],
  [IntroPassBy, at(4), 96],
  [BuildQuestion, at(5), 192],
  [DropLogo, at(7), 96],
  [AppTour, at(8), 288],
  [StrokeScene, at(11), 96],
  [VerbScene, at(12), 96],
  [LanguageMorph, at(13), 96],
  [LanguageGrid, at(14), 96],
  [Montage, at(15), 384],
  [BuildFree, at(19), 192],
  [EndCard, at(21), 240],
];

// Sound effects: [file, frame, volume].
const SFX: [string, number, number][] = [
  ["tick", 4, 0.3], ["tick", 16, 0.3], ["tick", 48, 0.3], ["tick", 60, 0.3],
  ...[0, 1, 2, 3].map((i) => ["pop", at(2, i), 0.45] as [string, number, number]),
  ...[0, 1, 2, 3].map((i) => ["swish_up", at(3, i), 0.4] as [string, number, number]),
  ["whoosh", at(4) + 4, 0.35],
  ["whoosh", at(8) - 4, 0.55],
  ...[32, 48, 64, 80].map((f) => ["tick", at(8) + f, 0.45] as [string, number, number]),
  ["click", at(8) + 144, 0.9], ["pop", at(8) + 146, 0.4],
  ["whoosh", at(8) + 190, 0.25], ["tick", at(8) + 200, 0.4],
  ["click", at(8) + 240, 0.9], ["pop", at(8) + 242, 0.4],
  ["whoosh_rev", at(11) - 30, 0.4],
  ...[0, 1, 2, 3, 4, 5].map((i) => ["tick", at(11) + 6 + i * 8, 0.3] as [string, number, number]),
  ...[24, 32, 40, 48].map((f) => ["pop", at(11) + f, 0.3] as [string, number, number]),
  ["swish_up", at(12) + 24, 0.5], ["pop", at(12) + 56, 0.4], ["pop", at(12) + 72, 0.4],
  ...[0, 1, 2, 3].map((i) => ["swish_up", at(13, i), 0.35] as [string, number, number]),
  ...[0, 1, 2, 3].map((i) => ["pop", at(14, i), 0.4] as [string, number, number]),
  ...Array.from({length: 16}, (_, i) => ["pop", at(15) + i * 24, 0.35] as [string, number, number]),
  ...[1, 2, 3].map((b) => ["whoosh", at(15 + b) - 8, 0.3] as [string, number, number]),
];

export const Promo: React.FC = () => (
  <AbsoluteFill style={{background: "#000"}}>
    {SCENES.map(([Scene, from, dur]) => (
      <Sequence key={from} from={from} durationInFrames={dur}>
        <Scene/>
      </Sequence>
    ))}
    <Vignette strength={0.22}/>
    <Grain opacity={0.06}/>
    <Audio src={staticFile("music.wav")}/>
    {SFX.map(([name, from, volume], i) => (
      <Sequence key={`${name}-${from}-${i}`} from={from} durationInFrames={120}>
        <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume}/>
      </Sequence>
    ))}
  </AbsoluteFill>
);
