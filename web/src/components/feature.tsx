import type { ReactNode } from "react";
import { Arrow, Button } from "./chrome";
import { FadeIn, RevealText } from "./motion";

// Building blocks shared by the "under the hood" pages (/agents, /paypal, /channel3, /render, /kernel, /elastic), so each one
// reads like the landing page: big display type, serif prose, mono labels, hairlines.

export const UNDER_THE_HOOD = [
  { href: "/agents", label: "Agents" },
  { href: "/paypal", label: "PayPal" },
  { href: "/channel3", label: "Channel3" },
  { href: "/render", label: "Render" },
  { href: "/kernel", label: "Kernel" },
  { href: "/elastic", label: "Elastic" },
];

export const REPO = "https://github.com/Yashasm18/HandShake";
export const repoFile = (path: string) => `${REPO}/blob/main/web/${path}`;
export const source = (path: string) => repoFile(`src/${path}`);

export function FeatureHero({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede: ReactNode; children?: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 pb-16 pt-36 md:px-10 md:pb-24 md:pt-44">
      <p className="label animate-fade-up mb-8 flex items-center gap-2 text-muted">
        <span className="size-1.5 rounded-full bg-safe" /> {eyebrow}
      </p>
      <RevealText text={title} className="display max-w-[1200px] text-[clamp(46px,8.5vw,136px)]" delay={0.05} stagger={0.05} immediate />
      <div className="animate-fade-up mt-10 grid gap-10 md:mt-14 md:grid-cols-[1fr_auto] md:items-end" style={{ animationDelay: "0.35s" }}>
        <p className="max-w-[620px] text-[18px] leading-relaxed text-muted md:text-[21px]">{lede}</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/check" size="lg">
            Try it live <Arrow />
          </Button>
        </div>
      </div>
      {children}
    </section>
  );
}

export function Section({ id, eyebrow, title, intro, children, dark }: { id?: string; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode; dark?: boolean }) {
  const body = (
    <div className="mx-auto max-w-[1400px]">
      <p className={`label mb-8 ${dark ? "text-paper/50" : "text-muted"}`}>{eyebrow}</p>
      <RevealText as="h2" text={title} className="display max-w-[1100px] text-[clamp(36px,5.6vw,84px)]" />
      {intro && (
        <FadeIn>
          <p className={`mt-8 max-w-[680px] text-[18px] leading-relaxed ${dark ? "text-paper/65" : "text-muted"}`}>{intro}</p>
        </FadeIn>
      )}
      <div className="mt-14 md:mt-20">{children}</div>
    </div>
  );
  return dark ? (
    <section id={id} className="island bg-night px-5 py-24 text-paper md:px-10 md:py-36">
      {body}
    </section>
  ) : (
    <section id={id} className="px-5 py-24 md:px-10 md:py-36">
      {body}
    </section>
  );
}

// Numbered steps on a hairline rail; `tag` is the API or mechanism behind the step.
export function Steps({ steps, dark }: { steps: { t: string; d: ReactNode; tag?: string }[]; dark?: boolean }) {
  return (
    <ol className={`border-t ${dark ? "border-paper/15" : "hairline"}`}>
      {steps.map((s, i) => (
        <li key={s.t} className={`border-b ${dark ? "border-paper/15" : "hairline"}`}>
          <FadeIn delay={i * 0.05} className="grid gap-4 py-8 md:grid-cols-[90px_1fr_1.3fr_auto] md:items-baseline md:gap-8 md:py-10">
            <span className={`label ${dark ? "text-paper/45" : "text-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
            <h3 className="font-display text-[clamp(24px,2.6vw,36px)] font-semibold leading-[1.05] tracking-[-0.03em]">{s.t}</h3>
            <p className={`text-[17px] leading-relaxed ${dark ? "text-paper/65" : "text-muted"}`}>{s.d}</p>
            {s.tag ? <span className={`label self-start rounded-full border px-3 py-1.5 ${dark ? "border-paper/20 text-paper/60" : "hairline text-muted"}`}>{s.tag}</span> : <span />}
          </FadeIn>
        </li>
      ))}
    </ol>
  );
}

// "What we call": one row per API, with the exact endpoint and why Handshake needs it.
export function ApiList({ items }: { items: { name: string; call: string; why: ReactNode }[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-3xl border hairline bg-line">
      {items.map((x, i) => (
        <FadeIn key={x.name} delay={i * 0.04} className="grid gap-3 bg-paper p-6 md:grid-cols-[1fr_1.2fr_1.6fr] md:items-baseline md:gap-8 md:p-8">
          <p className="font-display text-[21px] font-semibold tracking-tight">{x.name}</p>
          <code className="w-fit rounded-lg bg-card px-2.5 py-1 font-mono text-[12.5px] text-ink">{x.call}</code>
          <p className="text-[16px] leading-relaxed text-muted">{x.why}</p>
        </FadeIn>
      ))}
    </div>
  );
}

// Real numbers from sandbox runs: proof over promises.
export function Proof({ stats }: { stats: { n: string; t: string; s: string }[] }) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-3xl border hairline bg-line ${stats.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
      {stats.map((x, i) => (
        <FadeIn key={x.t} delay={i * 0.08} className="bg-paper p-7 md:p-9">
          <p className="display text-[clamp(44px,5vw,76px)]">{x.n}</p>
          <p className="mt-5 max-w-[280px] text-[16px] leading-snug">{x.t}</p>
          <p className="label mt-5 text-muted">{x.s}</p>
        </FadeIn>
      ))}
    </div>
  );
}

export function Docs({ links }: { links: { label: string; href: string; note: string }[] }) {
  return (
    <ul className="border-t hairline">
      {links.map((l) => (
        <li key={l.href} className="border-b hairline">
          <a href={l.href} target="_blank" rel="noreferrer" className="group grid gap-2 py-6 md:grid-cols-[1fr_1.4fr_auto] md:items-center md:gap-8">
            <span className="font-display text-[22px] font-semibold tracking-tight transition-colors group-hover:text-muted">{l.label}</span>
            <span className="text-[16px] text-muted">{l.note}</span>
            <span className="label flex items-center gap-2 text-muted transition-colors group-hover:text-ink">
              Open <Arrow />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function TryIt({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-28 md:px-10 md:py-40">
      <RevealText as="h2" text={title} className="display text-[clamp(40px,7vw,112px)]" />
      <FadeIn className="mt-12 flex flex-wrap gap-3">
        <Button href="/check" size="lg">
          Check a deal <Arrow />
        </Button>
        <Button href="/check?mode=sell" size="lg" variant="ghost">
          Sell with Handshake
        </Button>
      </FadeIn>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 px-5 py-10 text-[14px] text-muted md:flex-row md:px-10">
        <p>Handshake · Built for the PayPal AI Hackathon. Runs on the PayPal sandbox: no real money moves.</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {UNDER_THE_HOOD.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-ink">{l.label}</a>
          ))}
          <a href="/deals" className="transition-colors hover:text-ink">My deals</a>
          <a href="/terms" className="transition-colors hover:text-ink">Terms</a>
          <a href="/privacy" className="transition-colors hover:text-ink">Privacy</a>
        </nav>
      </div>
    </footer>
  );
}
