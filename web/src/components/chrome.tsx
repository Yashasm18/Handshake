"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Suspense, useState, useSyncExternalStore, type ComponentProps, type MouseEvent } from "react";

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

const LINKS = [
  { href: "/agents", label: "Agents" },
  { href: "/paypal", label: "PayPal" },
  { href: "/channel3", label: "Channel3" },
];

function ActiveNavLinks() {
  return <NavLinks path={usePathname()} />;
}

function NavLinks({ path }: { path: string | null }) {
  return (
    <div className="hidden items-center gap-8 text-[15px] md:flex">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} className={`relative transition-colors hover:text-ink ${path === l.href ? "text-ink" : "text-muted"}`}>
          {l.label}
          {path === l.href && <motion.span layoutId="nav-dot" className="absolute -bottom-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-ink" />}
        </Link>
      ))}
    </div>
  );
}

export function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  // The bar stays pinned; it only picks up its frosted-glass background once the page moves.
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 20));
  return (
    <motion.header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "bg-paper/80 backdrop-blur-md" : ""}`}>
      <nav className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 md:px-10">
        <Logo />
        {/* Reading the URL needs a Suspense boundary on dynamic routes; the fallback is the same links, unhighlighted. */}
        <Suspense fallback={<NavLinks path={null} />}>
          <ActiveNavLinks />
        </Suspense>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button href="/check" size="sm">Check a deal</Button>
        </div>
      </nav>
    </motion.header>
  );
}

type Theme = "light" | "dark";

// The theme is owned by <html data-theme> (set pre-paint in layout.tsx); this just watches it.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as Theme;

export function ThemeToggle() {
  // null on the server: the real theme is only known in the browser.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null);

  function toggle(e: MouseEvent<HTMLButtonElement>) {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch {}
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce) return apply();
    // The new theme grows out of the button as a circle.
    const { clientX: x, clientY: y } = e;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  }

  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-10 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-ink/40"
    >
      {/* Sun shows in dark mode (it switches back to light), moon in light mode. Hidden until the theme is known. */}
      <span className={`relative block size-[18px] transition-opacity duration-300 ${theme ? "opacity-100" : "opacity-0"}`} aria-hidden>
        <svg viewBox="0 0 20 20" className={`absolute inset-0 transition-all duration-500 ease-out ${dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`}>
          <circle cx="10" cy="10" r="3.6" fill="currentColor" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="10" y1="1.8" x2="10" y2="3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${a} 10 10)`} />
          ))}
        </svg>
        <svg viewBox="0 0 20 20" className={`absolute inset-0 transition-all duration-500 ease-out ${dark ? "-rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}>
          <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" fill="currentColor" />
        </svg>
      </span>
    </button>
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
