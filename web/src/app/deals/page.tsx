import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PayPalSignIn } from "@/components/account";
import { Arrow, Button, Nav } from "@/components/chrome";
import { Footer } from "@/components/feature";
import { dealsForAccount } from "@/lib/server/deals";
import { currentAccount } from "@/lib/server/session";
import type { Deal } from "@/lib/types";
import { usd } from "@/lib/types";

export const metadata = { title: "My deals · Handshake" };

// Where each deal stands, in words, and whether it's waiting on this person.
function standing(d: Deal, role: "seller" | "buyer"): { text: string; tone: "act" | "wait" | "done" | "off" } {
  const meet = d.handoff === "meet";
  switch (d.status) {
    case "AWAITING_PAYMENT":
      return role === "seller" ? { text: "Waiting for a buyer to pay", tone: "wait" } : { text: "Not paid yet", tone: "act" };
    case "NEGOTIATING":
      return { text: "Agents are agreeing a price", tone: "wait" };
    case "HELD":
      if (meet) return { text: role === "seller" ? "Paid into hold · meet your buyer" : "Paid into hold · meet the seller", tone: "act" };
      return role === "seller" ? { text: "Paid into hold · ship it", tone: "act" } : { text: "Paid into hold · waiting to ship", tone: "wait" };
    case "SHIPPED":
      return role === "buyer" ? { text: "On its way · check it when it arrives", tone: "act" } : { text: "Shipped · waiting for the buyer", tone: "wait" };
    case "CLAIM_OPEN":
      return { text: "A problem was reported · respond", tone: "act" };
    case "SETTLED":
      return role === "seller" ? { text: `Paid out ${usd(d.paypal.payoutCents ?? 0)}`, tone: "done" } : { text: "Complete", tone: "done" };
    case "RELEASED":
      return { text: "Cancelled · hold released", tone: "off" };
  }
}

const TONE = { act: "bg-ink text-paper", wait: "border hairline text-muted", done: "bg-safe-soft text-safe", off: "border hairline text-muted" };

function DealRow({ d, role }: { d: Deal; role: "seller" | "buyer" }) {
  const s = standing(d, role);
  return (
    <li>
      <Link href={`/d/${d.id}?as=${role}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 border-t hairline py-6 transition-colors hover:bg-ink/[0.02] md:grid-cols-[1fr_auto_200px]">
        <div className="min-w-0">
          <p className="truncate font-display text-[22px] font-semibold tracking-tight md:text-[26px]">{d.title}</p>
          <p className="mt-1 text-[14px] text-muted">
            {role === "seller" ? "Selling" : `Buying from ${d.sellerName}`} · {d.handoff === "meet" ? "In person" : "Shipped"} · {new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
        <p className="display text-right text-[28px] md:text-[34px]">{usd(d.priceCents)}</p>
        <p className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
          <span className={`label rounded-full px-3 py-1.5 ${TONE[s.tone]}`}>{s.text}</span>
          <Arrow className="text-muted" />
        </p>
      </Link>
    </li>
  );
}

function List({ title, deals, role, empty }: { title: string; deals: Deal[]; role: "seller" | "buyer"; empty: string }) {
  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between">
        <h2 className="label text-muted">{title}</h2>
        <span className="label text-muted">{deals.length}</span>
      </div>
      {deals.length ? (
        <ul className="mt-4 border-b hairline">{deals.map((d) => <DealRow key={d.id} d={d} role={role} />)}</ul>
      ) : (
        <p className="mt-4 border-t hairline pt-6 text-[17px] text-muted">{empty}</p>
      )}
    </section>
  );
}

async function MyDeals() {
  await connection();
  const account = await currentAccount();
  if (!account) {
    return (
      <div className="max-w-[640px]">
        <h1 className="display text-[clamp(44px,7vw,96px)]">My deals</h1>
        <p className="mt-6 text-[18px] leading-relaxed text-muted">
          Sign in with PayPal to see every deal you&apos;re selling or buying, on any phone or computer. Deals you paid for by logging in to PayPal show up here too.
        </p>
        <div className="mt-10"><PayPalSignIn next="/deals" size="lg" /></div>
      </div>
    );
  }
  const mine = (await dealsForAccount(account.payerId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selling = mine.filter((d) => d.seller?.payerId === account.payerId);
  const buying = mine.filter((d) => d.buyer?.payerId === account.payerId && d.seller?.payerId !== account.payerId);
  const open = [...selling, ...buying].filter((d) => !["SETTLED", "RELEASED"].includes(d.status)).length;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label text-muted">{account.name}{account.verified ? " · Verified PayPal account" : ""}</p>
          <h1 className="display mt-4 text-[clamp(44px,7vw,96px)]">My deals</h1>
          <p className="mt-4 text-[18px] text-muted">{open ? `${open} in progress.` : "Nothing in progress."} Payouts go to your PayPal account.</p>
        </div>
        <Button href="/check?mode=sell" size="lg">Sell something <Arrow /></Button>
      </div>
      <List title="Selling" deals={selling} role="seller" empty="Nothing yet. Create a protected deal and send the link to your buyer." />
      <List title="Buying" deals={buying} role="buyer" empty="Deals you pay for with your PayPal account show up here." />
    </>
  );
}

export default function DealsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-dvh max-w-[1100px] px-5 pb-24 pt-28 md:px-10 md:pt-36">
        <Suspense fallback={<h1 className="display text-[clamp(44px,7vw,96px)]">My deals</h1>}>
          <MyDeals />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
