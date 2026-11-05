"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Arrow, Button } from "./chrome";

// Opened from a link in an email. Nothing changes until the person presses the button, because mail
// scanners open links on their own.
export function EmailLink() {
  const q = useSearchParams();
  const action = q.get("a") === "confirm" ? "confirm" : "mute";
  const deal = q.get("d") ?? "";
  const role = q.get("r") === "seller" ? "seller" : "buyer";
  const [state, setState] = useState<"ready" | "busy" | "done" | "error">("ready");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function go() {
    setState("busy");
    try {
      const r = await api<{ title: string }>("/api/email", { d: deal, r: role, t: q.get("t") ?? "", a: action });
      setTitle(r.title);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  const copy = {
    confirm: { eyebrow: "Email updates", title: "Confirm your email", body: "Handshake will email you when this deal needs you: when it's paid, shipped, delivered or settled. Nothing else.", button: "Confirm my email", done: "Confirmed. You'll get updates for this deal." },
    mute: { eyebrow: "Email updates", title: "Stop emails for this deal?", body: "You'll stop getting updates for this deal. The deal itself carries on, and you can turn emails back on from the deal page.", button: "Stop emails", done: "Done. No more emails for this deal." },
  }[action];

  return (
    <div>
      <p className="label text-muted">{copy.eyebrow}</p>
      <h1 className="display mt-4 text-[clamp(40px,6vw,76px)]">{state === "done" ? copy.done.split(".")[0] + "." : copy.title}</h1>
      <p className="mt-6 text-[18px] leading-relaxed text-muted">{state === "done" ? `${copy.done}${title ? ` (${title})` : ""}` : copy.body}</p>
      {state === "error" && <p className="mt-6 text-[16px] text-alert" role="alert">{error}</p>}
      <div className="mt-10 flex flex-wrap gap-3">
        {state !== "done" ? (
          <Button size="lg" onClick={go} disabled={state === "busy" || !deal}>
            {state === "busy" ? "One moment…" : copy.button}
          </Button>
        ) : (
          <Link href={`/d/${deal}?as=${role}`} className="inline-flex h-14 items-center gap-2 rounded-full bg-ink px-8 text-[16px] font-medium text-paper">
            Open the deal <Arrow />
          </Link>
        )}
      </div>
    </div>
  );
}
