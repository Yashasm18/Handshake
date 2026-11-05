"use client";

import { useState } from "react";
import type { DealView as Deal } from "@/lib/types";

type Role = "seller" | "buyer";
type Act = (action: string, body?: unknown) => Promise<unknown>;

// "Email me when this deal needs me." Each person manages only their own address; it's shown masked.
export function EmailUpdates({ deal, role, act, busy }: { deal: Deal; role: Role; act: Act; busy: string | null }) {
  const c = deal.notify?.[role] ?? null;
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const working = busy === "email" || busy === "email-mute";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const r = (await act("email", { role, email })) as { pending?: boolean } | undefined;
    if (r) {
      setSent(Boolean(r.pending));
      setEditing(false);
      setEmail("");
    }
  }

  const form = (
    <form onSubmit={save} className="mt-4 flex gap-2">
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Your email"
        className="min-w-0 flex-1 rounded-full border hairline bg-paper px-4 py-2.5 text-[15px] outline-none focus:border-ink/40"
      />
      <button disabled={working} className="shrink-0 rounded-full bg-ink px-4 text-[14px] font-medium text-paper disabled:opacity-50">
        {busy === "email" ? "Sending…" : "Email me"}
      </button>
    </form>
  );

  const usable = c && c.deliverable;
  let body: React.ReactNode;
  if (!c || editing) {
    body = (
      <>
        <p className="mt-3 text-[15px] text-muted">Get an email the moment this deal needs you: paid, shipped, delivered, settled.</p>
        {form}
        {editing && <button onClick={() => setEditing(false)} className="label mt-3 text-muted hover:text-ink">Cancel</button>}
      </>
    );
  } else if (!usable) {
    body = (
      <>
        <p className="mt-3 text-[15px] text-muted">Your PayPal sandbox address ({c.email}) is made up, so it can&apos;t receive email. Add your real one.</p>
        {form}
      </>
    );
  } else if (!c.confirmed) {
    body = (
      <>
        <p className="mt-3 text-[15px]">
          {sent ? "Sent. " : ""}Check your inbox and confirm <span className="font-medium">{c.email}</span>. Nothing else is sent until you do.
        </p>
        <button onClick={() => setEditing(true)} className="label mt-3 text-muted hover:text-ink">Use another address</button>
      </>
    );
  } else {
    body = (
      <>
        <p className="mt-3 text-[15px]">
          {c.muted ? "Paused for " : "Updates go to "}
          <span className="font-medium">{c.email}</span>
          {c.source === "paypal" && <span className="text-muted"> · from PayPal</span>}
        </p>
        <div className="mt-3 flex gap-4">
          <button onClick={() => setEditing(true)} className="label text-muted hover:text-ink">Change</button>
          <button disabled={working} onClick={() => act("email-mute", { role, muted: !c.muted })} className="label text-muted hover:text-ink">
            {c.muted ? "Turn back on" : "Pause"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="rounded-[28px] border hairline bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="label text-muted">Email updates</p>
        {c?.confirmed && usable && !c.muted && !editing && <span className="label rounded-full bg-safe-soft px-2.5 py-1 text-safe">On</span>}
      </div>
      {body}
    </div>
  );
}
