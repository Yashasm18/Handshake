import type { CSSProperties } from "react";
import { ICONS } from "./brand-icons";

// `dark` is the brand color to use on the dark theme, where the deep brand blues would vanish.
// `mark` is a sponsor's own square logo file; `wordmark` is a full logo (light and dark versions) that
// already spells the name, so it replaces both the mark and the name.
type Item = {
  name: string;
  role: string;
  icon?: keyof typeof ICONS;
  mono?: string;
  color?: string;
  dark?: string;
  mark?: string;
  wordmark?: { light: string; dark: string };
};

const ITEMS: Item[] = [
  { name: "PayPal", role: "Holds · Payouts", icon: "paypal", color: "#003087", dark: "#4cb3ff" },
  { name: "Channel3", role: "Market prices", wordmark: { light: "/brands/channel3-light.svg", dark: "/brands/channel3-dark.svg" } },
  { name: "Kernel", role: "Cloud browsers", mark: "/brands/kernel.svg" },
  { name: "Claude", role: "Vision AI", icon: "anthropic" },
  { name: "GPT", role: "Backup AI", icon: "openai" },
  { name: "OpenRouter", role: "AI routing", mono: "OR" },
  { name: "Render", role: "Hosting", icon: "render" },
  { name: "Next.js", role: "Full-stack app", icon: "nextdotjs" },
  { name: "React", role: "Interface", icon: "react", color: "#0a7ea4", dark: "#61dafb" },
  { name: "TypeScript", role: "Type safety", icon: "typescript", color: "#3178c6", dark: "#5c9ce6" },
  { name: "Zod", role: "AI output checks", icon: "zod", color: "#3e67b1", dark: "#7b9be0" },
  { name: "Tailwind CSS", role: "Styling", icon: "tailwindcss", color: "#0e9ac0", dark: "#38bdf8" },
  { name: "Motion", role: "Animation", mono: "M" },
];

function Mark({ item }: { item: Item }) {
  if (item.mark) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.mark} alt="" className="size-[clamp(26px,2.6vw,36px)] shrink-0 rounded-lg" />;
  }
  if (item.icon) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-[clamp(26px,2.6vw,36px)] shrink-0 text-(--c) dark:text-(--cd)"
        style={{ "--c": item.color ?? "currentColor", "--cd": item.dark ?? item.color ?? "currentColor" } as CSSProperties}
        aria-hidden
      >
        <path d={ICONS[item.icon]} fill="currentColor" />
      </svg>
    );
  }
  return (
    <span className="flex size-[clamp(26px,2.6vw,36px)] shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-[11px] font-medium text-paper" aria-hidden>
      {item.mono}
    </span>
  );
}

// Same marquee language as the scam strip above it, running the other way.
export function BuiltWith() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <section aria-labelledby="built-with" className="py-20 md:py-28">
      <div className="mx-auto mb-10 flex max-w-[1400px] flex-wrap items-end justify-between gap-4 px-5 md:px-10">
        <h2 id="built-with" className="display text-[clamp(32px,4.5vw,64px)]">
          Powered by PayPal.
          <br />
          <span className="text-muted">Built with the best.</span>
        </h2>
        <p className="label max-w-[300px] text-muted">The tools behind every check, hold and payout</p>
      </div>
      <div className="group relative overflow-hidden border-y hairline py-8 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <ul className="flex w-max animate-[marquee_45s_linear_infinite_reverse] gap-4 group-hover:[animation-play-state:paused]">
          {row.map((item, i) => (
            <li
              key={i}
              aria-hidden={i >= ITEMS.length}
              className="flex items-center gap-4 rounded-full border hairline bg-card py-3 pl-4 pr-6 transition-colors duration-300 hover:border-ink/30"
            >
              {item.wordmark ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.wordmark.light} alt={item.name} className="h-[clamp(22px,2.4vw,32px)] w-auto dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.wordmark.dark} alt={item.name} className="hidden h-[clamp(22px,2.4vw,32px)] w-auto dark:block" />
                </>
              ) : (
                <>
                  <Mark item={item} />
                  <span className="font-display text-[clamp(20px,2.2vw,30px)] font-semibold tracking-[-0.03em]">{item.name}</span>
                </>
              )}
              <span className="label hidden text-muted sm:inline">{item.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
