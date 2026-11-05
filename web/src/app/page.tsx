import { Arrow, Button, Nav } from "@/components/chrome";
import { WatchDeal } from "@/components/watch-deal";
import { FadeIn, RevealText } from "@/components/motion";
import { HowItWorks } from "@/components/how-it-works";
import { BuiltWith } from "@/components/built-with";
import { Footer } from "@/components/feature";
import { NegotiationDemo } from "@/components/negotiation-demo";
import Link from "next/link";

const CATCHES = [
  "“Send it Friends & Family, saves us both the fee”",
  "“I'm moving tomorrow, first to pay gets it”",
  "“I sent too much, refund me the difference”",
  "“Can you ship it to my cousin instead?”",
  "“Pay this invoice to unlock the listing”",
  "“Here's the payment screenshot”",
];

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="mx-auto flex min-h-[92dvh] max-w-[1400px] flex-col justify-end px-5 pb-14 pt-32 md:px-10 md:pb-20">
          <p className="label animate-fade-up mb-8 flex items-center gap-2 text-muted">
            <span className="size-1.5 rounded-full bg-safe" /> For anyone buying or selling with a stranger
          </p>
          <RevealText
            text={"Buy from strangers.\nKeep your money."}
            className="display text-[clamp(52px,10.5vw,168px)]"
            delay={0.05}
            stagger={0.05}
            immediate
          />
          <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-[1fr_auto] md:items-end">
            <div className="animate-fade-up" style={{ animationDelay: "0.35s" }}>
              <p className="max-w-[520px] text-[18px] leading-relaxed text-muted md:text-[20px]">
                Paste the chat. Handshake checks it for scam tricks and real prices from 25,000 stores, lets AI agents negotiate a fair deal, and PayPal holds the money until the item really arrives.
              </p>
            </div>
            <div className="animate-fade-up flex flex-wrap gap-3" style={{ animationDelay: "0.45s" }}>
              <Button href="/check" size="lg">
                Check a deal <Arrow />
              </Button>
              <Button href="/check?mode=sell" size="lg" variant="ghost">
                I&apos;m selling
              </Button>
              <Button href="#see-how" size="lg" variant="ghost">
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
                Watch how it works
              </Button>
            </div>
          </div>
        </section>

        {/* Scam phrases marquee */}
        <section id="catches" className="overflow-hidden border-y hairline island bg-night py-7 text-paper">
          <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-14 whitespace-nowrap">
            {[...CATCHES, ...CATCHES].map((c, i) => (
              <span key={i} className="display relative text-[clamp(24px,3vw,40px)] text-paper/85">
                {c}
                <span className="absolute left-0 top-1/2 h-[3px] w-full -translate-y-1/2 bg-alert" />
              </span>
            ))}
          </div>
        </section>

        <WatchDeal />

        <HowItWorks />

        {/* Agents, shown not told */}
        <section className="mx-auto grid max-w-[1400px] gap-12 px-5 py-24 md:grid-cols-[0.9fr_1.1fr] md:items-center md:px-10 md:py-36">
          <div>
            <p className="label mb-8 text-muted">New · Agent negotiation</p>
            <RevealText as="h2" text={"Two agents.\nOne fair price."} className="display text-[clamp(44px,6.5vw,104px)]" />
            <FadeIn>
              <p className="mt-8 max-w-[480px] text-[18px] leading-relaxed text-muted">
                Set a secret max, and PayPal holds it so the seller knows you&apos;re serious. Your agent haggles with theirs using real market prices. Code makes sure neither one crosses a limit.
              </p>
              <Button href="/agents" variant="ghost" className="mt-10">
                How the agents work <Arrow />
              </Button>
            </FadeIn>
          </div>
          <FadeIn>
            <NegotiationDemo compact />
          </FadeIn>
        </section>

        {/* Under the hood: one page per partner technology */}
        <section className="mx-auto max-w-[1400px] px-5 pb-8 md:px-10">
          <p className="label mb-8 text-muted">Under the hood</p>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/agents", k: "Agents", n: "0", t: "times an agent crossed its owner's limit, across 266 automated tests and live prompt-injection runs." },
              { href: "/paypal", k: "PayPal", n: "7", t: "PayPal calls take a deal from hold to payout, each one run live on the sandbox in our end-to-end tests." },
              { href: "/channel3", k: "Channel3", n: "25k", t: "stores priced live to catch bait, set a fair range and price damaged parts." },
              { href: "/render", k: "Render", n: "4", t: "deadlines enforced by a Render Workflow, tested to fire exactly once, so no deal can stall." },
              { href: "/kernel", k: "Kernel", n: "1", t: "pasted link is all a buyer needs: a Kernel cloud browser reads the listing and spots store photos." },
              { href: "/elastic", k: "Elastic", n: "3", t: "ways scam memory recognizes a scam again: the same details, the same tactics, the same photo." },
            ].map((c, i) => (
              <FadeIn key={c.href} delay={i * 0.08}>
                <Link href={c.href} className="group flex h-full flex-col rounded-[28px] border hairline bg-card p-7 transition-colors hover:border-ink/30">
                  <span className="flex items-center justify-between">
                    <span className="label text-muted">{c.k}</span>
                    <Arrow className="text-muted transition-colors group-hover:text-ink" />
                  </span>
                  <span className="display mt-10 text-[clamp(56px,6vw,88px)]">{c.n}</span>
                  <span className="mt-4 max-w-[300px] text-[16px] leading-snug text-muted">{c.t}</span>
                </Link>
              </FadeIn>
            ))}
          </div>
        </section>

        <BuiltWith />

        {/* Problem, in numbers */}
        <section className="mx-auto max-w-[1400px] px-5 pb-28 pt-8 md:px-10 md:pb-40 md:pt-12">
          <p className="label mb-10 text-muted">The problem</p>
          <div className="grid gap-px overflow-hidden rounded-3xl border hairline bg-line md:grid-cols-3">
            {[
              { n: "$15.9B", t: "lost to fraud by Americans in 2025, a record.", s: "FTC" },
              { n: "#2", t: "most reported fraud: online shopping scams.", s: "FTC, 2025" },
              { n: "0", t: "protection when you pay a stranger with Friends & Family.", s: "PayPal" },
            ].map((x, i) => (
              <FadeIn key={x.n} delay={i * 0.1} className="bg-paper p-8 md:p-10">
                <p className="display text-[clamp(56px,7vw,104px)]">{x.n}</p>
                <p className="mt-6 max-w-[280px] text-[17px] leading-snug">{x.t}</p>
                <p className="label mt-6 text-muted">Source: {x.s}</p>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* Trust principle */}
        <section id="trust" className="island bg-night px-5 py-28 text-paper md:px-10 md:py-40">
          <div className="mx-auto max-w-[1400px]">
            <p className="label mb-10 text-paper/50">Why it&apos;s safe</p>
            <RevealText as="h2" text={"The AI advises.\nCode moves the money."} className="display text-[clamp(44px,8vw,128px)]" />
            <div className="mt-16 grid gap-10 md:grid-cols-3">
              {[
                ["PayPal holds it", "Your money sits in a PayPal authorization, not with us and not with the seller. If the deal falls apart, the hold is released and you pay nothing."],
                ["Both people agree", "AI suggests an outcome. Nothing is captured until both of you tap accept. Hard limits mean a refund can never exceed what you paid."],
                ["Prices are real", "Market prices and repair costs come from live listings across 25,000 retailers, so a refund is evidence, not a guess."],
              ].map(([h, p], i) => (
                <FadeIn key={h} delay={i * 0.1} className="border-t border-paper/15 pt-6">
                  <h3 className="font-display text-[22px] font-semibold tracking-tight">{h}</h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-paper/60">{p}</p>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1400px] px-5 py-28 md:px-10 md:py-40">
          <RevealText as="h2" text={"Got a deal that feels\ntoo good to be true?"} className="display text-[clamp(40px,7vw,112px)]" />
          <FadeIn className="mt-12">
            <Button href="/check" size="lg">
              Check it in 10 seconds <Arrow />
            </Button>
          </FadeIn>
        </section>
      </main>
      <Footer />
    </>
  );
}
