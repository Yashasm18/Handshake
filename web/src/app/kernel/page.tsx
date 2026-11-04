import { Nav } from "@/components/chrome";
import { ApiList, Docs, FeatureHero, Footer, Proof, Section, Steps, TryIt, repoFile, source } from "@/components/feature";
import { FadeIn } from "@/components/motion";

export const metadata = {
  title: "Kernel · Handshake",
  description: "How Handshake uses Kernel cloud browsers to open a pasted listing link, read its price and photos, and catch sellers who post store photos instead of the real item.",
};

// Real listings scanned during testing on November 4, 2026.
const PHOTOS = [
  {
    tag: "Seller's own photo",
    tone: "safe",
    item: "Nintendo Switch OLED, $220 · craigslist.org",
    read: "Console, carrying case and box on a beige carpet, uneven indoor lighting: a real home.",
  },
  {
    tag: "Seller's own photo",
    tone: "safe",
    item: "Switch OLED Zelda edition, $350 · craigslist.org",
    read: "Box and console parts on a wooden deck with visible wear, unlike any studio render.",
  },
  {
    tag: "Store photo",
    tone: "alert",
    item: "“New” AirPods Pro 3, $140 · craigslist.org",
    read: "Apple's product render: a seamless white background and no real surroundings. Flagged.",
  },
] as const;

export default function KernelPage() {
  return (
    <>
      <Nav />
      <main>
        <FeatureHero
          eyebrow="Kernel · Cloud browsers for agents"
          title={"Paste a link.\nWe open it for you."}
          lede="Buyers shouldn't have to copy listings by hand. Paste a Marketplace, Craigslist or OfferUp link, and Handshake opens it in a real browser in Kernel's cloud, reads the price and photos, and checks whether the photos are really the seller's."
        />

        <section className="mx-auto grid max-w-[1400px] gap-5 px-5 md:grid-cols-3 md:px-10">
          {PHOTOS.map((p, i) => (
            <FadeIn key={p.item} delay={i * 0.1} className="flex flex-col rounded-[28px] border hairline bg-card p-6 md:p-7">
              <span className={`label self-start rounded-full px-2.5 py-1 ${p.tone === "alert" ? "bg-alert-soft text-alert" : "bg-safe-soft text-safe"}`}>{p.tag}</span>
              <h3 className="mt-5 font-display text-[24px] font-semibold leading-[1.1] tracking-[-0.03em]">{p.item}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-muted">{p.read}</p>
            </FadeIn>
          ))}
        </section>

        <Section
          eyebrow="How it works"
          title={"One link.\nFive checks."}
          intro="A pasted link replaces copying text and taking screenshots. Everything after the browser step is the same check every deal gets."
        >
          <Steps
            steps={[
              { t: "Check the link", d: "Only public web pages are opened. Local addresses, names that resolve to private networks, odd ports and credentials in links are refused before any browser starts.", tag: "Code" },
              { t: "Open it in the cloud", d: "Kernel starts a stealth Chromium in about a second. It loads the page like a person would, scripts and all, then reads the title, price, description and photos.", tag: "Kernel · browsers.create" },
              { t: "Fetch the photos there too", d: "The listing's photos are downloaded inside Kernel's browser, not by our server, so a listing can never point Handshake at an internal address.", tag: "Kernel · playwright.execute" },
              { t: "Compare with the store", d: "AI looks at each photo next to Channel3's store images of the same product: is it the real item in a real room, or a product render?", tag: "AI · Vision + Channel3" },
              { t: "Code decides", d: "Any store photo becomes a flag with a plain next step: ask for a photo of the item next to today's date. The browser is closed every time.", tag: "Deterministic" },
            ]}
          />
        </Section>

        <Section
          dark
          eyebrow="Why it matters"
          title={"Stolen photos are\nthe first sign."}
          intro="A seller who doesn't have the item can't photograph it, so many fake listings reuse the manufacturer's images. It's the easiest thing for a buyer to miss and the easiest for Handshake to check."
        >
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["Real browsers get in", "Marketplace pages are built by JavaScript and turn away simple scripts. A headful, stealth browser sees what a buyer sees."],
              ["Nothing runs on our server", "The page and its photos are opened in Kernel's sandbox. Our server only receives text and images, and checks every link first."],
              ["Short and always closed", "Each scan holds a browser for a few seconds and deletes it in a finally block, even when a page fails to load."],
            ].map(([h, p], i) => (
              <FadeIn key={h} delay={i * 0.08} className="border-t border-paper/15 pt-6">
                <h3 className="font-display text-[22px] font-semibold tracking-tight">{h}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-paper/60">{p}</p>
              </FadeIn>
            ))}
          </div>
        </Section>

        <Section eyebrow="Proof" title={"Tested on\nreal listings."}>
          <Proof
            stats={[
              { n: "1.3s", t: "to start a stealth cloud browser; a full link scan, from paste to verdict, takes about 20 seconds.", s: "Kernel" },
              { n: "9", t: "real Craigslist listings scanned: 7 showed the sellers' own photos, 1 had none, and 1 used Apple's AirPods render and was flagged.", s: "Live scans" },
              { n: "20", t: "automated tests for link and DNS safety, browser cleanup, the photo rule and the link limits.", s: "Vitest" },
            ]}
          />
        </Section>

        <Section eyebrow="What we call" title="Under the hood.">
          <ApiList
            items={[
              { name: "Start a browser", call: "browsers.create({ stealth: true })", why: "A fresh, isolated Chromium per scan with bot detection handled, capped at 60 seconds." },
              { name: "Read the page", call: "browsers.playwright.execute", why: "Our Playwright code runs next to the browser: load the page, read its text and largest images, download up to three photos." },
              { name: "Clean up", call: "browsers.deleteByID", why: "Every browser is deleted when the scan ends, whether it worked or not." },
            ]}
          />
        </Section>

        <Section eyebrow="Docs & source" title="Read the details.">
          <Docs
            links={[
              { label: "Kernel listing reader", href: source("lib/server/kernel.ts"), note: "Link checks, the in-browser reader and cleanup." },
              { label: "Photo check", href: source("lib/server/checks.ts"), note: "Store-image comparison and the stock-photo rule." },
              { label: "Kernel tests", href: repoFile("test/kernel.test.ts"), note: "Refused links, cleanup on failure, the photo rule and rate limits." },
              { label: "Kernel docs", href: "https://www.kernel.sh/docs", note: "Browsers, stealth mode and Playwright execution." },
            ]}
          />
        </Section>

        <TryIt title={"Paste a link\nbefore you pay."} />
      </main>
      <Footer />
    </>
  );
}
