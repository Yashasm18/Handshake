import { Nav } from "@/components/chrome";
import { ApiList, Docs, FeatureHero, Footer, Proof, Section, Steps, TryIt, source } from "@/components/feature";
import { FadeIn } from "@/components/motion";

export const metadata = {
  title: "PayPal · Handshake",
  description: "How Handshake uses PayPal holds, partial captures, tracking and payouts to make deals between strangers safe.",
};

// A real sandbox settlement: a $215 backed offer, agreed at $210.
const LEDGER = [
  { k: "Buyer's offer held by PayPal", v: "$215.00", note: "Orders v2 · AUTHORIZE" },
  { k: "Agents agree on", v: "$210.00", note: "Only this can ever be charged" },
  { k: "Captured after delivery", v: "$210.00", note: "Payments v2 · final_capture" },
  { k: "Released to the buyer", v: "$5.00", note: "Never charged" },
  { k: "PayPal fee", v: "−$5.93", note: "From the capture" },
  { k: "Paid to the seller", v: "$204.07", note: "Payouts v1", strong: true },
];

export default function PayPalPage() {
  return (
    <>
      <Nav />
      <main>
        <FeatureHero
          eyebrow="PayPal · Holds, captures, payouts"
          title={"PayPal holds the money.\nNobody holds their breath."}
          lede="Every Handshake deal runs on PayPal's own payment primitives. The buyer's money is reserved, not sent; the seller sees it's real; and only the right amount ever moves, after the item arrives."
        />

        <section className="mx-auto max-w-[1400px] px-5 md:px-10">
          <FadeIn className="island overflow-hidden rounded-[28px] bg-night p-6 text-paper md:p-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="label text-paper/50">One real sandbox deal, start to finish</p>
              <p className="label text-paper/50">Nintendo Switch OLED · asking $230</p>
            </div>
            <dl className="mt-8">
              {LEDGER.map((r, i) => (
                <FadeIn key={r.k} delay={i * 0.08} className={`grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-paper/12 py-5 md:grid-cols-[1.2fr_1fr_auto] ${r.strong ? "text-safe" : ""}`}>
                  <dt className="font-display text-[clamp(18px,2vw,24px)] font-semibold tracking-tight">{r.k}</dt>
                  <span className="label order-3 col-span-2 text-paper/45 md:order-none md:col-span-1">{r.note}</span>
                  <dd className="display text-right text-[clamp(28px,3.6vw,52px)] tabular-nums">{r.v}</dd>
                </FadeIn>
              ))}
            </dl>
          </FadeIn>
        </section>

        <Section
          eyebrow="The deal lifecycle"
          title={"Seven PayPal calls.\nZero trust needed."}
          intro="Paying a stranger usually means trusting them first. Handshake puts PayPal in the middle of every step, so neither side has to."
        >
          <Steps
            steps={[
              { t: "Reserve, don't send", d: "The buyer approves a PayPal order with intent AUTHORIZE. The money is held on their account and nothing moves to anyone.", tag: "Orders v2" },
              { t: "Know where it ships", d: "The authorization returns the buyer's PayPal-verified address. The seller's label is checked against it, because shipping elsewhere voids Seller Protection.", tag: "Shipping address" },
              { t: "Keep it reserved", d: "PayPal guarantees a hold for three days. If the item is still in transit, a Render Workflow reauthorizes it so the funds stay reserved until delivery.", tag: "Reauthorize" },
              { t: "Charge only what's fair", d: "On delivery, Handshake captures the deal price, or less after a damage refund, with final_capture. PayPal releases whatever is left.", tag: "Partial capture" },
              { t: "Prove it shipped", d: "Tracking is attached to the PayPal capture, which is what Seller Protection looks for.", tag: "Order tracking" },
              { t: "Pay the seller", d: "The seller's share goes out through PayPal Payouts, after PayPal's fee, straight to their PayPal account.", tag: "Payouts v1" },
              { t: "Or release it all", d: "Seller never ships, or the agents can't agree? The hold is voided and the buyer is never charged.", tag: "Void" },
            ]}
          />
        </Section>

        <Section dark eyebrow="Built for real money" title={"No double charges.\nNo hijacked payments."}>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["Idempotent by default", "Every PayPal request carries its own PayPal-Request-Id, so a retry or a double click can never charge twice."],
              ["Bound to one browser", "Checkout is pinned to the browser that started it with a private cookie. A stranger holding an order id can't finish someone else's payment."],
              ["Amounts set in code", "The AI never decides how much money moves. Capture amounts come from the agreed price and code-capped refund rules."],
            ].map(([h, p], i) => (
              <FadeIn key={h} delay={i * 0.08} className="border-t border-paper/15 pt-6">
                <h3 className="font-display text-[22px] font-semibold tracking-tight">{h}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-paper/60">{p}</p>
              </FadeIn>
            ))}
          </div>
        </Section>

        <Section eyebrow="Proof" title={"Run end to end\non the sandbox."}>
          <Proof
            stats={[
              { n: "$223.55", t: "paid to a seller after PayPal's $6.45 fee on a $230 deal: hold, ship, capture, track, payout.", s: "Full deal" },
              { n: "$5", t: "of a $215 backed offer released automatically when the agents agreed on $210.", s: "Partial capture" },
              { n: "100%", t: "of a hold returned when the agents couldn't agree, voided before anyone was charged.", s: "Void" },
            ]}
          />
        </Section>

        <Section eyebrow="What we call" title="Every PayPal API we use.">
          <ApiList
            items={[
              { name: "Log in with PayPal", call: "POST /v1/oauth2/token · GET /v1/identity/oauth2/userinfo", why: "Sellers sign in on PayPal's own page. Handshake gets their verified status and payer id, never a password." },
              { name: "Create order", call: "POST /v2/checkout/orders", why: "intent AUTHORIZE at the deal price, or at the buyer's max for a backed offer." },
              { name: "Authorize", call: "POST /v2/checkout/orders/{id}/authorize", why: "Turns the buyer's approval into a hold and returns their PayPal-verified shipping address." },
              { name: "Capture", call: "POST /v2/payments/authorizations/{id}/capture", why: "Captures the agreed amount, or less after a refund, with final_capture so the rest is released." },
              { name: "Reauthorize", call: "POST /v2/payments/authorizations/{id}/reauthorize", why: "Renews the hold after PayPal's 3-day honor period, run on schedule by a Render Workflow." },
              { name: "Void", call: "POST /v2/payments/authorizations/{id}/void", why: "Releases the whole hold on cancel, when the agents can't agree, or when the seller misses the shipping deadline." },
              { name: "Add tracking", call: "POST /v2/checkout/orders/{id}/track", why: "Attaches the carrier and tracking number to the capture for Seller Protection." },
              { name: "Payouts", call: "POST /v1/payments/payouts", why: "Sends the seller their net amount after PayPal's fee, into their own PayPal account by payer id." },
              { name: "JS SDK Buttons", call: "intent=authorize", why: "PayPal's own checkout window, plus the sandbox test card for judges without a login." },
            ]}
          />
        </Section>

        <Section eyebrow="Docs & source" title="Read the details.">
          <Docs
            links={[
              { label: "PayPal client", href: source("lib/server/paypal.ts"), note: "Every call above, with idempotency keys." },
              { label: "Deal flows", href: source("lib/server/flows.ts"), note: "Hold, ship, settle, refund and cancel, in order." },
              { label: "Orders v2", href: "https://developer.paypal.com/docs/api/orders/v2/", note: "Create, authorize and track." },
              { label: "Payments v2", href: "https://developer.paypal.com/docs/api/payments/v2/", note: "Capture and void authorizations." },
              { label: "Payouts", href: "https://developer.paypal.com/docs/api/payments.payouts-batch/v1/", note: "Paying the seller." },
              { label: "Authorize & capture guide", href: "https://developer.paypal.com/docs/checkout/standard/customize/authorization/", note: "PayPal's guide to the hold-then-capture pattern." },
              { label: "Idempotency", href: "https://developer.paypal.com/api/rest/reference/idempotency/", note: "Why every request carries PayPal-Request-Id." },
            ]}
          />
        </Section>

        <TryIt title={"Pay a stranger\nwithout trusting one."} />
      </main>
      <Footer />
    </>
  );
}
