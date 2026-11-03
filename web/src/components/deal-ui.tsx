import type { ReactNode } from "react";

export function Panel({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "dark" | "alert" | "safe" | "held" }) {
  const tones = {
    plain: "bg-card border hairline",
    dark: "island bg-night text-paper",
    alert: "bg-alert-soft",
    safe: "bg-safe-soft",
    held: "bg-held-soft",
  };
  return <div className={`rounded-[28px] p-6 md:p-9 ${tones[tone]}`}>{children}</div>;
}

export function Headline({ eyebrow, title, body, tone }: { eyebrow: string; title: string; body?: ReactNode; tone?: string }) {
  return (
    <>
      <p className={`label ${tone ?? "text-muted"}`}>{eyebrow}</p>
      <h2 className="mt-4 font-display text-[clamp(30px,3.6vw,46px)] font-semibold leading-[1.02] tracking-[-0.035em]">{title}</h2>
      {body && <div className="mt-4 max-w-[560px] font-serif text-[17px] leading-relaxed opacity-75 [font-size-adjust:0.52]">{body}</div>}
    </>
  );
}
