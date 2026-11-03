"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState, type ComponentProps } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2 ${className}`} aria-label="Handshake home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <circle cx="12" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="20" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" className="transition-transform duration-500 group-hover:-translate-x-1" />
      </svg>
      <span className="font-display text-[19px] font-semibold tracking-[-0.03em]">Handshake</span>
    </Link>
  );
}

export function Nav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > prev && y > 200);
    setSolid(y > 20);
  });
  return (
    <motion.header
      animate={{ y: hidden ? -90 : 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "bg-paper/80 backdrop-blur-md" : ""}`}
    >
      <nav className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 md:px-10">
        <Logo />
        <div className="hidden items-center gap-8 text-[15px] text-muted md:flex">
          <Link href="/#how" className="transition-colors hover:text-ink">How it works</Link>
          <Link href="/#catches" className="transition-colors hover:text-ink">What it catches</Link>
          <Link href="/#trust" className="transition-colors hover:text-ink">Why it&apos;s safe</Link>
        </div>
        <Button href="/check" size="sm">Check a deal</Button>
      </nav>
    </motion.header>
  );
}

type ButtonProps = {
  variant?: "primary" | "ghost" | "light";
  size?: "sm" | "md" | "lg";
  href?: string;
} & ComponentProps<"button">;

export function Button({ variant = "primary", size = "md", href, className = "", children, ...rest }: ButtonProps) {
  const sizes = { sm: "h-10 px-5 text-[14px]", md: "h-12 px-6 text-[15px]", lg: "h-14 px-8 text-[16px]" };
  const variants = {
    primary: "bg-ink text-paper hover:bg-ink/85",
    ghost: "border border-ink/15 text-ink hover:border-ink/40 hover:bg-ink/[0.03]",
    light: "bg-paper text-ink hover:bg-white",
  };
  const cls = `group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium transition-all duration-300 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`;
  const inner = (
    <>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return (
    <button className={cls} {...rest}>
      {inner}
    </button>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 transition-transform duration-300 group-hover:translate-x-0.5 ${className}`} aria-hidden>
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
