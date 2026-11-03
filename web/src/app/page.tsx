import { Arrow, Button, Nav } from "@/components/chrome";
import { FadeIn, RevealText } from "@/components/motion";
import { HowItWorks } from "@/components/how-it-works";
import { BuiltWith } from "@/components/built-with";

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
                Paste the chat. Handshake checks it for scam tricks and compares the price against 25,000 stores. Then PayPal holds the money until the item really arrives.
              </p>
            </div>
            <div className="animate-fade-up flex flex-wrap gap-3" style={{ animationDelay: "0.45s" }}>
              <Button href="/check" size="lg">
                Check a deal <Arrow />
              </Button>
              <Button href="/check?mode=sell" size="lg" variant="ghost">
                I&apos;m selling
              </Button>
            </div>
          </div>
        </section>

        {/* Scam phrases marquee */}
        <section id="catches" className="overflow-hidden border-y hairline bg-night py-7 text-paper">
          <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-14 whitespace-nowrap">
            {[...CATCHES, ...CATCHES].map((c, i) => (
              <span key={i} className="display relative text-[clamp(24px,3vw,40px)] text-paper/85">
                {c}
                <span className="absolute left-0 top-1/2 h-[3px] w-full -translate-y-1/2 bg-alert" />
              </span>
            ))}
          </div>
        </section>

        <HowItWorks />

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
        <section id="trust" className="bg-night px-5 py-28 text-paper md:px-10 md:py-40">
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
      <footer className="border-t hairline">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 px-5 py-10 text-[14px] text-muted md:flex-row md:px-10">
          <p>Handshake · Built for the PayPal AI Hackathon. Runs on the PayPal sandbox: no real money moves.</p>
          <p>Payments by PayPal · Prices by Channel3</p>
        </div>
      </footer>
    </>
  );
}
