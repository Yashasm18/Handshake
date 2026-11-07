"use client";

import { useRef, useState } from "react";
import { FadeIn, RevealText } from "./motion";

// The narrated demo: a scam stopped, then one real deal from listing to payout, recorded on the live site.
// It loads nothing until someone presses play, then plays with sound, since the narration is the point.
export function WatchDeal() {
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  return (
    <section id="see-how" className="mx-auto max-w-[1400px] scroll-mt-24 px-5 py-24 md:px-10 md:py-36">
      <p className="label mb-8 text-muted">See how it works</p>
      <div className="grid gap-8 md:grid-cols-[1fr_minmax(0,460px)] md:items-end">
        <RevealText as="h2" text={"One real deal,\nstart to finish."} className="display text-[clamp(44px,6.5vw,104px)]" />
        <FadeIn>
          <p className="text-[18px] leading-relaxed text-muted">
            Two and a half narrated minutes on the live site: AI stops a scam, then an honest deal goes from listing to payout, with PayPal holding the money until the item arrives.
          </p>
        </FadeIn>
      </div>
      <FadeIn className="mt-12">
        <div className="island relative aspect-video overflow-hidden rounded-[28px] bg-night shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
          {playing ? (
            <video
              ref={video}
              className="size-full"
              src="/video/demo.mp4"
              poster="/video/demo.jpg"
              controls
              autoPlay
              playsInline
              preload="auto"
            >
              <track kind="captions" srcLang="en" label="English" src="/video/demo.vtt" />
            </video>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group absolute inset-0 size-full cursor-pointer"
              aria-label="Play the two-and-a-half-minute demo, with narration"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/video/demo.jpg" alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.015]" />
              <span className="absolute inset-0 bg-night/25 transition-colors group-hover:bg-night/15" />
              <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-paper py-2 pl-2 pr-5 text-ink md:gap-4 md:py-3 md:pl-3 md:pr-7 shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105">
                <span className="flex size-10 items-center justify-center rounded-full bg-ink text-paper md:size-14">
                  <svg viewBox="0 0 24 24" className="ml-0.5 size-5 md:ml-1 md:size-6" aria-hidden><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
                </span>
                <span className="text-left">
                  <span className="block font-display text-[16px] font-semibold tracking-tight md:text-[19px]">Watch it work</span>
                  <span className="label hidden text-muted sm:block">2:33 · narrated</span>
                </span>
              </span>
            </button>
          )}
        </div>
      </FadeIn>
      <p className="label mt-5 flex flex-wrap gap-x-3 gap-y-1 text-muted">
        <span>Recorded on the live site · PayPal sandbox money, real API calls</span>
        <a href="https://youtu.be/qnwLbxLTqNE" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
          Watch on YouTube ↗
        </a>
      </p>
    </section>
  );
}
