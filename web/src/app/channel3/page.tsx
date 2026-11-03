import { Nav } from "@/components/chrome";
import { ApiList, Docs, FeatureHero, Footer, Proof, Section, Steps, TryIt, repoFile, source } from "@/components/feature";
import { FadeIn } from "@/components/motion";

export const metadata = {
  title: "Channel3 · Handshake",
  description: "How Handshake uses Channel3's product data to catch scam prices, set a fair negotiation range, and price damage from real replacement parts.",
};

// Three jobs, each with numbers from real Channel3 searches during testing.
const USES = [
  {
    tag: "01 · Scam check",
    title: "Too cheap to be real",
    body: "A listed price is compared with the median of live retail prices. Used goods normally sell 20–50% under retail, so only a deeper gap is flagged.",
    item: "iPhone 13 128GB",
    min: 0,
    max: 30_000,
    band: [22_000, 26_500],
    mark: 9_000,
    markLabel: "Listed $90",
    note: "63% under the $242 retail median → flagged as bait",
    tone: "alert",
  },
  {
    tag: "02 · Fair range",
    title: "What it's really worth used",
    body: "Retail prices plus the item's condition give a fair used range, computed in code. Both negotiating agents argue inside it.",
    item: "Nintendo Switch OLED",
    min: 15_000,
    max: 46_000,
    band: [22_000, 30_000],
    mark: 44_200,
    markLabel: "Retail $442",
    note: "Used, small scuff → fair range $220–$300",
    tone: "safe",
  },
  {
    tag: "03 · Damage pricing",
    title: "Refunds from real part prices",
    body: "When an item arrives damaged, the broken part is priced from live listings, so a partial refund is evidence, not a guess.",
    item: "Cracked left Joy-Con",
    min: 0,
    max: 30_000,
    band: [2_659, 8_000],
    mark: 4_999,
    markLabel: "Part $49.99",
    note: "Refund ≈ the part's price, capped by severity in code",
    tone: "safe",
  },
] as const;

const pos = (c: number, min: number, max: number) => `${Math.min(100, Math.max(0, ((c - min) / (max - min)) * 100))}%`;

export default function Channel3Page() {
  return (
    <>
      <Nav />
      <main>
        <FeatureHero
          eyebrow="Channel3 · 100M+ products, 25,000+ stores"
          title={"Real prices.\nNot guesses."}
          lede="Scammers win when nobody knows what something is worth. Handshake asks Channel3 for live prices across 25,000 retailers, and uses them for three different jobs across a deal."
        />

        <section className="mx-auto grid max-w-[1400px] gap-5 px-5 md:grid-cols-3 md:px-10">
          {USES.map((u, i) => (
            <FadeIn key={u.tag} delay={i * 0.1} className="flex flex-col rounded-[28px] border hairline bg-card p-6 md:p-7">
              <p className="label text-muted">{u.tag}</p>
              <h3 className="mt-4 font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em]">{u.title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-muted">{u.body}</p>
              <div className="mt-auto pt-8">
                <p className="label text-muted">{u.item}</p>
                <div className="relative mt-8 h-8">
                  <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-ink/10" />
                  <div className="absolute top-2 h-3.5 rounded-full bg-safe-soft ring-1 ring-safe/30" style={{ left: pos(u.band[0], u.min, u.max), width: `calc(${pos(u.band[1], u.min, u.max)} - ${pos(u.band[0], u.min, u.max)})` }} />
                  <div className="absolute top-0 -translate-x-1/2" style={{ left: pos(u.mark, u.min, u.max) }}>
                    <span className={`block size-[22px] rounded-full ring-4 ring-card ${u.tone === "alert" ? "bg-alert" : "bg-ink"}`} />
                    {/* Near either end, the label grows inward so it never runs off the card. */}
                    <span
                      className={`label absolute -top-6 whitespace-nowrap ${u.tone === "alert" ? "text-alert" : "text-ink"} ${
                        (u.mark - u.min) / (u.max - u.min) > 0.75 ? "right-0" : (u.mark - u.min) / (u.max - u.min) < 0.2 ? "left-0" : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      {u.markLabel}
                    </span>
                  </div>
                </div>
                <p className={`mt-4 text-[15px] ${u.tone === "alert" ? "text-alert" : "text-safe"}`}>{u.note}</p>
              </div>
            </FadeIn>
          ))}
        </section>

        <Section
          eyebrow="How it works"
          title={"One search API.\nThree decisions."}
          intro="The same Channel3 search powers each step. What changes is the question we ask it, and how carefully we clean the answer before money depends on it."
        >
          <Steps
            steps={[
              { t: "Read the deal", d: "AI reads the pasted chat or screenshot and writes a precise store query for the exact item, model and storage.", tag: "AI · Vision" },
              { t: "Search 25,000 stores", d: "Channel3 returns normalized products with prices, images and buy links in one call.", tag: "POST /v1/search" },
              { t: "Clean the results", d: "Cases, chargers, docks and protectors are filtered out of an item search, so a $12 case can't drag down an iPhone's price.", tag: "Accessory filter" },
              { t: "Take the median", d: "The middle price of what's left is the retail benchmark. Code, not AI, computes every percentage.", tag: "Deterministic" },
              { t: "Use it three ways", d: "Flag bait prices, set the agents' fair range, and price a damaged part for a partial refund.", tag: "Scan · Agents · Claims" },
            ]}
          />
        </Section>

        <Section
          dark
          eyebrow="Clean data in, fair money out"
          title={"We found a bug.\nNow it can't come back."}
          intro="In testing, a search for a cracked “Switch OLED left Joy-Con” returned whole consoles next to the part, and the refund was priced from a $304 median. A $50 part nearly cost a seller $138."
        >
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["Name the part", "Part prices only count listings whose title actually names the broken part, so a Joy-Con is priced from Joy-Cons."],
              ["Nothing priced like the item", "Any listing that costs most of the deal itself is dropped from a part search. A console can't be a “replacement Joy-Con”."],
              ["Locked in by tests", "The exact Channel3 results from that bug are saved as test data. If the filter ever regresses, the tests fail and the deploy stops."],
            ].map(([h, p], i) => (
              <FadeIn key={h} delay={i * 0.08} className="border-t border-paper/15 pt-6">
                <h3 className="font-display text-[22px] font-semibold tracking-tight">{h}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-paper/60">{p}</p>
              </FadeIn>
            ))}
          </div>
          <FadeIn className="mt-14 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t border-paper/15 pt-8">
            <p className="display text-[clamp(40px,6vw,88px)] text-paper/35 line-through decoration-alert decoration-[3px]">$304</p>
            <p className="display text-[clamp(40px,6vw,88px)] text-safe">$49.99</p>
            <p className="max-w-[360px] text-[16px] text-paper/60">The same cracked Joy-Con, priced before and after the part filter, from the same Channel3 results.</p>
          </FadeIn>
        </Section>

        <Section eyebrow="Proof" title={"Live data,\nreal outcomes."}>
          <Proof
            stats={[
              { n: "3", t: "jobs for one API: the scam check on every deal, the agents' fair range, and damage pricing on claims.", s: "Uses" },
              { n: "63%", t: "under retail: the $90 “iPhone 13” that Handshake flagged as bait against a $242 median.", s: "Scam check" },
              { n: "$49.99", t: "for a cracked Joy-Con, from real single Joy-Con listings, not consoles.", s: "Damage pricing" },
            ]}
          />
        </Section>

        <Section eyebrow="What we call" title="Under the hood.">
          <ApiList
            items={[
              { name: "Item search", call: "POST /v1/search", why: "The exact item from the deal. Prices become the retail median for the scam check and the agents' fair range." },
              { name: "Part search", call: "POST /v1/search", why: "Just the damaged part, filtered to listings that name it, to price a partial refund." },
              { name: "Product data", call: "title · price · image · buy link", why: "Shown to the buyer as the comparison list, so every number links to a real product." },
            ]}
          />
        </Section>

        <Section eyebrow="Docs & source" title="Read the details.">
          <Docs
            links={[
              { label: "Channel3 client & filters", href: source("lib/server/channel3.ts"), note: "The search call, the accessory filter and the part filter." },
              { label: "Price checks", href: source("lib/server/checks.ts"), note: "Scam scan, market median and the 55% bait threshold." },
              { label: "Pricing tests", href: repoFile("test/pricing.test.ts"), note: "Built on the real Channel3 results from the Joy-Con bug." },
              { label: "Channel3 docs", href: "https://docs.trychannel3.com/", note: "The search API and product data model." },
              { label: "Channel3 for developers", href: "https://trychannel3.com/developers", note: "API keys and getting started." },
            ]}
          />
        </Section>

        <TryIt title={"Check a price\nbefore you pay."} />
      </main>
      <Footer />
    </>
  );
}
