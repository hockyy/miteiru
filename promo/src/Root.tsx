import React from "react";
import {Composition} from "remotion";
import {Scenery} from "./Scenery";
import {Promo} from "./Promo";
import {Thumbnail} from "./Thumbnail";
import {FPS, H, TOTAL, W} from "./anim";
import {waitForFonts} from "./fonts";

waitForFonts();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={W} height={H}/>
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={60} fps={FPS} width={W} height={H}/>
    <Composition id="Scenery" component={Scenery} durationInFrames={30 * 40} fps={30} width={1920} height={1080}/>
  </>
);
