"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ICONS } from "./brand-icons";

export type Me = { enabled: boolean; account: { name: string; firstName: string; email?: string; verified: boolean } | null };

// One request per page load, shared by every component that asks who is signed in.
let pending: Promise<Me> | null = null;
let current: Me | null = null;
const listeners = new Set<() => void>();

function load() {
  pending ??= fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => r.json() as Promise<Me>)
    .catch(() => ({ enabled: false, account: null }))
    .then((me) => {
      current = me;
      listeners.forEach((l) => l());
      return me;
    });
  return pending;
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => listeners.delete(l);
}

// null while loading.
export const useMe = () => useSyncExternalStore(subscribe, () => current, () => null);

export function signInHref(next?: string) {
  const here = next ?? (typeof window === "undefined" ? "/deals" : window.location.pathname + window.location.search);
  return `/api/auth/signin?next=${encodeURIComponent(here)}`;
}

export async function signOut() {
  await fetch("/api/auth/signout", { method: "POST" });
  window.location.assign("/");
}

export function PayPalMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={ICONS.paypal} fill="currentColor" />
    </svg>
  );
}

// The PayPal-branded sign-in button: PayPal's own page handles the login, Handshake never sees a password.
export function PayPalSignIn({ next, label = "Sign in with PayPal", size = "md", onBeforeLeave }: { next?: string; label?: string; size?: "sm" | "md" | "lg"; onBeforeLeave?: () => void }) {
  const sizes = { sm: "h-10 px-4 text-[14px]", md: "h-12 px-6 text-[15px]", lg: "h-14 px-8 text-[16px]" };
  return (
    <a
      href={signInHref(next)}
      onClick={onBeforeLeave}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#ffc439] font-semibold text-[#003087] transition-all duration-300 hover:brightness-95 active:scale-[0.97] ${sizes[size]}`}
    >
      <PayPalMark className={size === "sm" ? "size-4" : "size-[18px]"} />
      {label}
    </a>
  );
}

export function VerifiedTick({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <path d="M10 1.5 12.2 3.3 15 3 15.9 5.7 18.4 7.1 17.6 9.9 18.4 12.7 15.9 14.1 15 16.8 12.2 16.5 10 18.3 7.8 16.5 5 16.8 4.1 14.1 1.6 12.7 2.4 9.9 1.6 7.1 4.1 5.7 5 3 7.8 3.3Z" fill="currentColor" />
      <path d="m6.6 10.2 2.3 2.3 4.6-4.8" fill="none" stroke="var(--color-paper, #fff)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NOTICES: Record<string, { text: string; tone: "safe" | "alert" }> = {
  ok: { text: "Signed in with PayPal.", tone: "safe" },
  cancelled: { text: "Sign-in cancelled. Nothing was shared.", tone: "alert" },
  expired: { text: "That sign-in link expired. Try again.", tone: "alert" },
  failed: { text: "PayPal sign-in didn't work. Try again.", tone: "alert" },
  unavailable: { text: "PayPal sign-in isn't available right now.", tone: "alert" },
};

// The ?signin= outcome PayPal's round trip came back with: shown once, then removed from the address bar.
function useSignInNotice() {
  const [notice, setNotice] = useState<(typeof NOTICES)[string] | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("signin");
    if (!outcome) return;
    url.searchParams.delete("signin");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    const n = NOTICES[outcome];
    if (!n) return;
    queueMicrotask(() => setNotice(n));
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, []);
  return notice;
}

// Top-right of every page: a sign-in button, or the signed-in person with My deals and Sign out.
export function AccountMenu() {
  const me = useMe();
  const notice = useSignInNotice();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const toast = notice && (
    <p role="status" className={`absolute right-0 top-14 whitespace-nowrap rounded-full px-4 py-2 text-[14px] text-paper shadow-lg ${notice.tone === "safe" ? "bg-safe" : "bg-alert"}`}>
      {notice.text}
    </p>
  );

  if (!me || !me.enabled) return <div className="relative">{toast}</div>;
  if (!me.account) {
    return (
      <div className="relative">
        <a href={signInHref()} className="flex h-10 items-center gap-2 rounded-full border border-ink/15 px-3 text-[14px] text-ink transition-colors hover:border-ink/40 sm:px-4" aria-label="Sign in with PayPal">
          <PayPalMark className="size-4" />
          <span className="hidden sm:inline">Sign in</span>
        </a>
        {toast}
      </div>
    );
  }

  const a = me.account;
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-full border border-ink/15 pl-1 pr-3 text-[14px] text-ink transition-colors hover:border-ink/40"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-ink font-display text-[14px] font-semibold text-paper">{a.firstName.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-[110px] truncate sm:inline">{a.firstName}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-[260px] overflow-hidden rounded-3xl border hairline bg-paper p-2 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
          <div className="px-4 pb-3 pt-3">
            <p className="font-display text-[17px] font-semibold tracking-tight">{a.name}</p>
            {a.email && <p className="truncate text-[14px] text-muted">{a.email}</p>}
            <p className="label mt-2 flex items-center gap-1.5 text-muted">
              <PayPalMark className="size-3.5" /> {a.verified ? "Verified PayPal account" : "Signed in with PayPal"}
            </p>
          </div>
          <div className="border-t hairline pt-1">
            <Link href="/deals" role="menuitem" onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 text-[15px] transition-colors hover:bg-ink/[0.05]">
              My deals
            </Link>
            <button role="menuitem" onClick={signOut} className="block w-full rounded-2xl px-4 py-3 text-left text-[15px] text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      )}
      {!open && toast}
    </div>
  );
}
