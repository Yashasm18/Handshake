"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "./motion";

const WORDS = ["Reading the chat", "Checking 25,000 stores", "Holding the money", "Handshake"];

// Plays once per visit. The words are what the product actually does, in order.
export function Preloader() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("hs-intro") === "1";
      sessionStorage.setItem("hs-intro", "1");
    } catch {}
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const start = performance.now();
    const total = 2200;
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / total);
      setPct(Math.round(t * 100));
      setStep(Math.min(WORDS.length - 1, Math.floor(t * WORDS.length)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setShow(false), 350);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-night text-paper"
          exit={{ clipPath: "inset(0 0 100% 0)" }}
          transition={{ duration: 0.9, ease: EASE }}
          initial={{ clipPath: "inset(0 0 0% 0)" }}
        >
          <div className="relative flex items-start">
            <AnimatePresence mode="wait">
              <motion.p
                key={step}
                className="display text-[clamp(36px,7vw,96px)] uppercase"
                initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -30, filter: "blur(8px)" }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                {WORDS[step]}
              </motion.p>
            </AnimatePresence>
            <span className="label ml-2 mt-2 tabular-nums text-paper/60">{pct}</span>
          </div>
          <p className="label absolute bottom-10 text-paper/40">Safe deals between strangers</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
