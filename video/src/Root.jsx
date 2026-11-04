import React from "react";
import { Composition } from "remotion";
import { FPS } from "./timeline.js";
import { HowItWorks, TOTAL_FRAMES } from "./HowItWorks.jsx";

export const Root = () => (
  <Composition id="HowItWorks" component={HowItWorks} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
