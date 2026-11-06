import type { ReactNode } from "react";
import Link from "next/link";
import { Nav } from "@/components/chrome";
import { Footer, Proof } from "@/components/feature";
import { TESTS, TOTAL_TESTS } from "@/lib/facts";

export const metadata = {
  title: "Blog · Handshake",
  description: "How Handshake was built in four days for the PayPal AI Hackathon, what it taught us, and where it goes next as a company.",
};

// Long-form story of the build and the plan ahead, in the same type as the rest of the site.
export default function BlogPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-28 md:px-10 md:pt-36">
        <p className="label text-muted">The build story · November 2026</p>
        <h1 className="display mt-4 text-[clamp(44px,7vw,88px)]">
          {/* Broken after the comma on purpose, like the homepage, so "not the stranger" stays together. */}
          <span className="block">Trust the deal,</span>
          <span className="block">not the stranger.</span>
        </h1>
        <p className="mt-6 text-[20px] leading-relaxed text-muted">
          How Handshake went from a familiar bad feeling to a working product in four days, what it taught us, and where we want to take it.
        </p>
        <p className="label mt-8 text-muted">Yashas M · Founder · 8 min read</p>

        <div className="mt-16 space-y-14">
          <Part title="It starts with a message">
            <p>
              Almost everyone has a version of this story. You find a used console at a good price. The seller is friendly and replies fast. Then: <em>&ldquo;Still
              available! Send it Friends &amp; Family so there are no fees, and please do it in the next half hour, two other people are asking.&rdquo;</em>
            </p>
            <p>
              You stand there with your thumb over the button. If you pay, there&apos;s no protection at all. If you ask for buyer protection, the seller goes quiet. If
              you meet in person, you&apos;re carrying cash to meet a stranger. Honest sellers have it no better: fake &ldquo;payment sent&rdquo; screenshots, boxes
              that &ldquo;arrived empty&rdquo;, and chargebacks weeks later.
            </p>
            <p>
              What struck me is that this isn&apos;t a technology gap. PayPal can already hold money without sending it. AI can already read a chat and spot pressure
              tactics. Nobody had put them in the one place the risk actually happens: the moment two strangers agree a deal.
            </p>
          </Part>

          <Quote>The real problem is that trust has to come first. Handshake exists to remove that first leap.</Quote>

          <Part title="One rule before any code">
            <p>
              Before writing anything, I set one rule, and it shaped every decision after it: <strong>the AI advises, code moves the money.</strong>
            </p>
            <p>
              AI is very good at reading a messy chat, a blurry shipping label or a photo of a cracked controller. It should never be the thing that decides how much
              money moves. So every model in Handshake returns structured data checked against a strict schema, and every amount, limit and refund is computed by
              plain, tested code, then executed by PayPal.
            </p>
          </Part>

          <Part title="Day one: money first">
            <p>
              I started with the part that had to be right: the money. Before there was a single screen, a script proved the whole PayPal lifecycle on the sandbox:
              hold the buyer&apos;s money with an authorization, capture part of it, attach tracking, pay the seller, release a hold. That gave Handshake its shape: the
              buyer&apos;s money is reserved, not sent, and only the fair amount is ever captured.
            </p>
            <p>
              By the evening there was a working site: the scam check, PayPal-held deals, AI damage claims, and two AI agents negotiating a price. That last one
              needed the most care. Each agent knows only its own owner&apos;s secret limit, and a referee written in code checks every offer and every message, so
              neither can cross its limit or leak it, even when a listing tries to talk it into doing so.
            </p>
            <p>
              Deals also had to finish on their own, so deadlines moved into a Render Workflow: a seller who never ships has the hold released, an old hold is
              renewed, and a buyer who goes quiet after a verified delivery can&apos;t stall the seller forever.
            </p>
          </Part>

          <Part title="Day two: making it real">
            <p>
              Day two was about proof. A live test suite started running real deals against the PayPal sandbox and the real AI models, with real images: scam
              screenshots, shipping labels to the right and wrong address, a cracked Joy-Con, even a coffee cup sent as &ldquo;damage&rdquo;. It found a real
              privacy bug on its first run, and that set the habit for the rest of the week: every bug becomes a test.
            </p>
            <p>
              Then the product grew. A buyer can paste a listing link and a cloud browser checks whether the photos are the seller&apos;s own. Every scam caught is
              remembered, so the next one is recognised by its tactics, a reused phone number or a reused photo, but only after two different people report it, so
              nobody can smear an honest seller. And for local deals, the buyer checks the item and scans the seller&apos;s one-time code: PayPal pays on the spot, no
              cash involved.
            </p>
          </Part>

          <Part title="Day three: from demo to product">
            <p>
              Sign in with PayPal came first, so sellers are paid into their own account. Chrome flagged the first version as phishing: a free-hosting address
              jumping straight to a PayPal login looks exactly like a scam kit. The fix was humbling and simple: let the browser go to PayPal itself.
            </p>
            <p>
              Payouts taught the biggest lesson. After many test deals they started failing, because PayPal was holding the incoming money on a new business
              account. Handshake learned to queue a refused payout and retry it, to tell a seller they&apos;re paid only once PayPal confirms it, and to pay from a
              separate balance. Then came emails, real parcel tracking with the carrier, a public status page, and a proper database where two servers can never run
              the same money step at once.
            </p>
          </Part>

          <Part title="Day four: trying to break it">
            <p>
              The last day started with an uncomfortable discovery: the automated tests had quietly written test deals into the live database during a deploy. Now
              tests strip every live setting first, and any attempt to reach a real service from a test fails loudly.
            </p>
            <p>
              Then I attacked the live site the way a scammer would: stolen links, forged requests, injected scripts, five buyers paying at the same moment, prompt
              injection. Most of it held. The most important find was subtle: the &ldquo;no red flags&rdquo; badge on a deal page came from the seller&apos;s own
              browser, so a scammer could have forged one. Scans are now sealed by the server, and a seller&apos;s own check never vouches for them. I also walked
              through it as a stranger would, which found the most human bug of all: someone trying it alone could never see the buyer&apos;s side.
            </p>
          </Part>

          <Proof
            stats={[
              { n: "4", t: "days from the first sandbox call to a hardened product", s: "The build" },
              { n: String(TOTAL_TESTS), t: `automated tests, plus ${TESTS.liveScenarios} live runs on the PayPal sandbox`, s: "Proof" },
              { n: "9", t: "PayPal calls, from a held payment to a paid seller", s: "PayPal" },
            ]}
          />

          <Part title="What we learned">
            <ul>
              <li><strong>Build the money path first, and make it boring.</strong> Saving each step as it happens and never repeating a payment is what let everything else move fast.</li>
              <li><strong>Every bug becomes a test.</strong> Many of the {TESTS.app} app tests exist because something real went wrong, or nearly did.</li>
              <li><strong>Trust signals are attack surface.</strong> Anything that tells a buyer &ldquo;this is safe&rdquo; has to be impossible for a seller to fake.</li>
              <li><strong>Test as a stranger.</strong> Scripts proved the money was right; only walking through it as a newcomer showed where a person gets stuck.</li>
            </ul>
          </Part>

          <div className="border-t hairline pt-14">
            <p className="label text-muted">Where this goes</p>
            <h2 className="display mt-4 text-[clamp(36px,5vw,60px)]">From a hackathon project to a company.</h2>
            <p className="mt-6 text-[18px] leading-relaxed text-muted">
              Handshake works end to end today on the PayPal sandbox. Here is how we think about turning it into a business: our plan and reasoning, not promises.
            </p>
          </div>

          <Part title="The opportunity">
            <p>
              Secondhand trade between strangers is huge and growing, and almost none of it has a safe way to pay. Marketplaces protect deals that stay inside their
              own checkout, but people meet in comment threads, group chats and forums, and the moment money changes hands, they&apos;re on their own. That gap is
              where scams live.
            </p>
            <p>
              Handshake&apos;s bet is that trust shouldn&apos;t belong to one marketplace. It should travel with the deal. A link is all either side needs, wherever
              they met.
            </p>
          </Part>

          <Part title="Who we serve first">
            <p>
              <strong>Secondhand electronics and gaming.</strong> It&apos;s where the pain is sharpest: items are valuable, easy to ship, easy to fake, and they have
              real store prices to compare against, which is exactly where Handshake&apos;s checks are strongest. We&apos;d start with the communities that already
              trade this way: buy-and-sell forums, Discord and WhatsApp trading groups, and campus marketplaces.
            </p>
          </Part>

          <Part title="How it makes money">
            <ul>
              <li><strong>The scam check stays free.</strong> It&apos;s how people find us, and every check makes scam memory smarter for everyone.</li>
              <li><strong>A small fee on each protected deal.</strong> Paid when the deal settles, and always far less than what a single scam costs. If the deal falls through, nobody pays it.</li>
              <li><strong>Handshake for platforms.</strong> Communities and smaller marketplaces could add &ldquo;Protected by Handshake&rdquo; to their listings, and use scam memory to catch repeat scammers before they post.</li>
            </ul>
          </Part>

          <Quote>Every protected deal introduces Handshake to a stranger: the other side of the deal.</Quote>

          <Part title="How it grows">
            <p>
              Handshake spreads the way a payment link does. A seller sends a Handshake link to a buyer who has never heard of it; the buyer has a safe experience
              and uses it for their next deal. And &ldquo;is this a scam?&rdquo; is a question people already ask their friends. A free, clear answer is easy to share.
            </p>
          </Part>

          <Part title="Why it's hard to copy">
            <ul>
              <li><strong>Scam memory compounds.</strong> Every scam caught makes the next check sharper. A newcomer starts with an empty memory.</li>
              <li><strong>Trust that travels.</strong> Over time, a record of completed protected deals becomes a reputation people carry across every platform they trade on.</li>
              <li><strong>Deep PayPal integration.</strong> Holds, partial captures, renewals, tracking and payouts working together safely took real work, and it&apos;s the foundation everything else stands on.</li>
            </ul>
          </Part>

          <Part title="What has to go right">
            <ul>
              <li><strong>Going live with PayPal.</strong> Real money means a production PayPal app and onboarding sellers through PayPal&apos;s platform tools, so payments go straight to them.</li>
              <li><strong>Disputes handled fairly.</strong> When people disagree, the case needs a clear path, ideally into PayPal&apos;s own Resolution Center with the evidence already attached.</li>
              <li><strong>Staying ahead of scammers.</strong> They adapt. Scam memory, human review and appeals have to grow with them.</li>
              <li><strong>Earning trust slowly.</strong> A safety product only works if people believe it. That means being honest about what it can and can&apos;t do, every time.</li>
            </ul>
          </Part>

          <Part title="The road ahead">
            <Roadmap
              steps={[
                { when: "Now", what: "Working end to end on the PayPal sandbox: checks, holds, negotiation, tracking, meetups, claims, deadlines." },
                { when: "Next", what: "Live payments with PayPal, sellers paid directly at capture, disputes into PayPal's Resolution Center, and a share-sheet app to check any listing in one tap." },
                { when: "Then", what: "The first trading communities on board, Venmo for buyers, and a reputation from completed deals that travels with you." },
                { when: "Later", what: "Agents that shop for you through PayPal's Agent Toolkit, inside the same limits and holds; PYUSD for cross-border deals; scam memory shared with platforms." },
              ]}
            />
          </Part>

          <Part title="Thank you">
            <p>
              To PayPal for the sandbox and the challenge, to Channel3, Render, Kernel and Elastic for the tools, and to everyone who has ever lost money to a stranger
              online. This is for you. Handshake was built by one developer with Claude Code as a pair programmer, and you can{" "}
              <Link className="underline" href="/check">
                try it right now
              </Link>
              .
            </p>
          </Part>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[26px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-[18px] leading-relaxed text-ink/80 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:font-serif [&_strong]:text-ink [&_ul]:space-y-2">{children}</div>
    </section>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="border-l-2 border-safe pl-6 font-display text-[clamp(24px,3vw,32px)] font-semibold leading-snug tracking-tight">{children}</blockquote>;
}

function Roadmap({ steps }: { steps: { when: string; what: string }[] }) {
  return (
    <ol className="mt-2 border-t hairline">
      {steps.map((s) => (
        <li key={s.when} className="grid gap-2 border-b hairline py-5 !ml-0 !list-none !pl-0 md:grid-cols-[120px_1fr] md:gap-8">
          <span className="label pt-1 text-muted">{s.when}</span>
          <p className="text-[17px] leading-relaxed">{s.what}</p>
        </li>
      ))}
    </ol>
  );
}
