import React from "react";
import { Composition } from "remotion";
import { Demo, FPS as DEMO_FPS, TOTAL_FRAMES as DEMO_FRAMES } from "./demo/Demo.jsx";
import { Thumbnail } from "./demo/Thumbnail.jsx";
import { ThumbDark, ThumbLight } from "./demo/YouTubeThumbs.jsx";
import { Gallery, SLIDE_COUNT } from "./demo/Gallery.jsx";

export const Root = () => (
  <>
    {/* The under-3-minute demo, composed at 1080p and rendered at 2x scale (2560x1440) or more. */}
    <Composition id="Demo" component={Demo} durationInFrames={DEMO_FRAMES} fps={DEMO_FPS} width={1920} height={1080} />
    {/* The Devpost thumbnail, 3:2. */}
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={30} width={1500} height={1000} />
    {/* YouTube thumbnails, 16:9. */}
    <Composition id="ThumbDark" component={ThumbDark} durationInFrames={1} fps={30} width={1280} height={720} />
    <Composition id="ThumbLight" component={ThumbLight} durationInFrames={1} fps={30} width={1280} height={720} />
    {/* The README's poster: the YouTube thumbnail with a play button. */}
    <Composition id="ReadmePoster" component={ThumbLight} defaultProps={{ play: true }} durationInFrames={1} fps={30} width={1280} height={720} />
    {/* The Devpost image gallery, 3:2: one slide per frame. */}
    <Composition id="Gallery" component={Gallery} durationInFrames={SLIDE_COUNT} fps={30} width={1500} height={1000} />
  </>
);
