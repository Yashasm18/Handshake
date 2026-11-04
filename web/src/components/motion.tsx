"use client";

import { motion, useInView, type HTMLMotionProps } from "motion/react";
import { useRef, type ReactNode } from "react";

export const EASE = [0.16, 1, 0.3, 1] as const;

// Words rise out of a mask, one after another: the headline treatment used across the site.
export function RevealText({
  text,
  className,
  delay = 0,
  stagger = 0.06,
  as: Tag = "h1",
  immediate = false,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "h1" | "h2" | "h3" | "p";
  // For text visible on load: animate with CSS from first paint instead of waiting for hydration.
  immediate?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const lines = text.split("\n");
  let i = 0;
  return (
    <Tag ref={ref} className={className} aria-label={text.replace(/\n/g, " ")}>
      {lines.map((line, li) => (
        <span key={li} className="block" aria-hidden>
          {line.split(" ").map((word, wi) => {
            const n = i++;
            return (
              // The mask gets room for descenders (g, y) and round overshoots (G, O); negative margins keep the spacing unchanged.
              <span key={wi} className="-mx-[0.08em] -mb-[0.16em] inline-block overflow-hidden px-[0.08em] pb-[0.24em] align-bottom">
                {immediate ? (
                  <span className="animate-word-rise inline-block" style={{ animationDelay: `${delay + n * stagger}s` }}>
                    {word}
                    {wi < line.split(" ").length - 1 ? " " : ""}
                  </span>
                ) : (
                  <motion.span
                    className="inline-block"
                    // Fully below the mask (which has extra room for descenders) until the word rises.
                    initial={{ y: "150%" }}
                    animate={inView ? { y: "0%" } : undefined}
                    transition={{ duration: 0.9, ease: EASE, delay: delay + n * stagger }}
                  >
                    {word}
                    {wi < line.split(" ").length - 1 ? " " : ""}
                  </motion.span>
                )}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

export function FadeIn({ children, delay = 0, y = 24, ...rest }: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
