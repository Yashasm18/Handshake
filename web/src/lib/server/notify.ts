import "server-only";
import { randomBytes } from "node:crypto";
import { deadlinesFor } from "../deadlines";
import type { Contact, ContactView, Deal, DealStatus } from "../types";
import { usd } from "../types";
import { deliverable, emailEnabled, maskEmail, sendEmail } from "./email";

type Role = "seller" | "buyer";

export const baseUrl = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
const scale = () => {
  const v = Number(process.env.TIMER_SCALE);
  return v > 0 && v <= 1 ? v : 1;
};

export const newContactToken = () => randomBytes(24).toString("base64url");

// An address PayPal gave us is already verified by PayPal, so it starts confirmed.
export function contactFromPayPal(email: string | undefined): Contact | undefined {
  if (!email) return undefined;
  return { email: email.trim().toLowerCase(), confirmed: true, token: newContactToken(), source: "paypal" };
}

// Fills in a side's contact from PayPal unless that side already chose an address.
export function adoptPayPalEmail(deal: Deal, role: Role, email: string | undefined) {
  const c = contactFromPayPal(email);
  if (!c || deal.contacts?.[role]) return;
  deal.contacts = { ...deal.contacts, [role]: c };
}

export function contactView(c: Contact | undefined): ContactView | null {
  if (!c) return null;
  return { email: maskEmail(c.email), confirmed: c.confirmed, muted: Boolean(c.muted), deliverable: deliverable(c.email), source: c.source };
}

export const notifyEnabled = emailEnabled;

// ── Rendering ────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const dealLink = (deal: Deal, role: Role) => `${baseUrl()}/d/${deal.id}?as=${role}`;
const settingsLink = (deal: Deal, role: Role, c: Contact, action: "confirm" | "mute") =>
  `${baseUrl()}/email?d=${encodeURIComponent(deal.id)}&r=${role}&t=${encodeURIComponent(c.token)}&a=${action}`;
export const oneClickUnsubscribe = (deal: Deal, role: Role, c: Contact) =>
  `${baseUrl()}/api/email/unsubscribe?d=${encodeURIComponent(deal.id)}&r=${role}&t=${encodeURIComponent(c.token)}`;

type Message = { subject: string; lead: string; body: string[]; cta: string; ctaUrl?: string };

function render(deal: Deal, role: Role, c: Contact, m: Message, opts: { footer: "deal" | "confirm"; neutral?: boolean }) {
  const url = m.ctaUrl ?? dealLink(deal, role);
  const unsubscribe = settingsLink(deal, role, c, "mute");
  const footer =
    opts.footer === "deal"
      ? `You're getting this because you're the ${role} on a Handshake deal. <a href="${esc(unsubscribe)}" style="color:#6b6760">Stop emails for this deal</a>.`
      : "If you didn't ask for this, ignore this email. Nothing will be sent to you.";
  const html = `<!doctype html><html><body style="margin:0;background:#f3f1ec;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#141413">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;padding:36px 32px">
<tr><td style="font-size:15px;font-weight:600;letter-spacing:-0.02em">Handshake</td></tr>
${opts.neutral ? "" : `<tr><td style="padding-top:28px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6760">${esc(deal.title)}</td></tr>`}
<tr><td style="padding-top:${opts.neutral ? 28 : 10}px;font-size:26px;line-height:1.2;font-weight:650;letter-spacing:-0.02em">${esc(m.lead)}</td></tr>
${m.body.map((p) => `<tr><td style="padding-top:14px;font-size:16px;line-height:1.55;color:#3b3a36">${esc(p)}</td></tr>`).join("")}
<tr><td style="padding-top:28px"><a href="${esc(url)}" style="display:inline-block;background:#141413;color:#f3f1ec;text-decoration:none;font-size:15px;font-weight:600;padding:14px 24px;border-radius:999px">${esc(m.cta)}</a></td></tr>
<tr><td style="padding-top:28px;font-size:13px;line-height:1.5;color:#6b6760">The money stays on hold until the item is checked, and every step happens on the deal page.</td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#6b6760;margin:18px auto 0">${footer}</p>
</td></tr></table></body></html>`;
  const text = [m.lead, "", ...m.body, "", `${m.cta}: ${url}`, "", "The money stays on hold until the item is checked, and every step happens on the deal page.", "", opts.footer === "deal" ? `Stop emails for this deal: ${unsubscribe}` : "If you didn't ask for this, ignore this email."].join("\n");
  return { subject: m.subject, html, text };
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

function deadline(deal: Deal, kind: string) {
  const d = deadlinesFor(deal, scale()).find((x) => x.kind === kind);
  return d && Number.isFinite(d.at) ? when(d.at) : null;
}

// What each side hears when a deal moves from one status to another. Undefined means stay quiet.
export function messagesFor(deal: Deal, prev: DealStatus | "NEW"): Partial<Record<Role, Message>> {
  const price = usd(deal.priceCents);
  const lastNote = [...deal.events].reverse().find((e) => e.actor === "handshake")?.text;
  switch (deal.status) {
    case "AWAITING_PAYMENT":
      if (prev === "NEW") {
        return {
          seller: {
            subject: `Your protected deal for ${deal.title} is ready`,
            lead: "Your deal link is ready to send.",
            body: [`Send this link to your buyer. When they pay, PayPal holds ${price} and we email you to ${deal.handoff === "meet" ? "arrange the meetup" : "ship"}.`],
            cta: "Open your deal",
          },
        };
      }
      if (prev === "NEGOTIATING") {
        return {
          seller: { subject: `No deal on ${deal.title} yet`, lead: "The agents couldn't agree on a price.", body: ["The buyer's offer was below your lowest price, so their hold was released. Your deal is still open to other buyers."], cta: "Open your deal" },
          buyer: { subject: `No deal on ${deal.title}`, lead: "Your hold was released in full.", body: ["Your offer and the seller's lowest price didn't overlap, so you weren't charged anything. You can still buy it at the asking price."], cta: "See the deal" },
        };
      }
      return {};
    case "NEGOTIATING":
      return {
        seller: { subject: `You have an offer on ${deal.title}`, lead: "You have a PayPal-backed offer.", body: ["The buyer's money is already held by PayPal. Your agent is negotiating now and will never go below your lowest price."], cta: "Watch the negotiation" },
      };
    case "HELD": {
      const agreed = prev === "NEGOTIATING" ? `Agreed at ${price}. ` : "";
      if (deal.handoff === "meet") {
        const by = deadline(deal, "MEET_BY");
        return {
          seller: { subject: `${price} is held for ${deal.title}. Time to meet.`, lead: `${agreed}${price} is held for you. Meet your buyer.`, body: [`Bring the item and open the deal on your phone at the meetup. When the buyer has checked it, they scan your code and PayPal pays you on the spot.`, by ? `Meet by ${by}, or the hold is released.` : ""].filter(Boolean), cta: "Open your deal" },
          buyer: { subject: `Your ${price} is held for ${deal.title}`, lead: `${agreed}${price} is held. You haven't been charged.`, body: [`Meet ${deal.sellerName} in a public place and check the item first. Only scan their code if you're happy with it.`], cta: "Open your deal" },
        };
      }
      const by = deadline(deal, "SHIP_BY");
      return {
        seller: { subject: `${price} is held for ${deal.title}. Ship it.`, lead: `${agreed}${price} is held for you. Ship it.`, body: ["Open your deal to see the buyer's PayPal-verified address, then add a photo of your shipping label. We check the label matches before it counts.", by ? `Ship by ${by}, or the hold is released and the buyer pays nothing.` : ""].filter(Boolean), cta: "Ship it" },
        buyer: { subject: `Your ${price} is held for ${deal.title}`, lead: `${agreed}${price} is held. You haven't been charged.`, body: [`${deal.sellerName} has been asked to ship to your PayPal address. We'll email you when it's on its way.`], cta: "See your deal" },
      };
    }
    case "SHIPPED": {
      const s = deal.shipment;
      const by = deadline(deal, "AUTO_RELEASE");
      return {
        buyer: { subject: `${deal.title} is on its way`, lead: "Your item is on its way.", body: [s ? `${s.carrier} tracking: ${s.trackingNumber}.` : "", "When it arrives, check it against what the seller promised. Then confirm it, or report a problem with a photo.", by ? `If you don't respond by ${by}, the payment is released to the seller.` : ""].filter(Boolean), cta: "Check it when it arrives" },
      };
    }
    case "CLAIM_OPEN": {
      const c = deal.claim;
      const offer = c ? `Handshake proposes a ${usd(c.refundCents)} refund, so the seller is paid ${usd(c.captureCents)}.` : "";
      return {
        seller: { subject: `The buyer reported a problem with ${deal.title}`, lead: "The buyer reported a problem.", body: [c?.finding ?? "", offer, "Accept it to settle now, or decline and the case goes to PayPal's Resolution Center."].filter(Boolean), cta: "Review the claim" },
        buyer: { subject: `We reviewed your report on ${deal.title}`, lead: "We reviewed your photo.", body: [c?.finding ?? "", offer, "It settles once you both accept."].filter(Boolean), cta: "Review the proposal" },
      };
    }
    case "SETTLED": {
      const paid = deal.paypal.payoutCents ?? 0;
      const charged = deal.paypal.capturedCents ?? deal.priceCents;
      const refund = deal.priceCents - charged;
      return {
        seller: { subject: `You've been paid ${usd(paid)} for ${deal.title}`, lead: `You've been paid ${usd(paid)}.`, body: [`PayPal sent ${usd(paid)} to your account, after its ${usd(deal.paypal.feeCents ?? 0)} fee.${refund > 0 ? ` The buyer was refunded ${usd(refund)}.` : ""}`], cta: "See the receipt" },
        buyer: { subject: `Deal complete: ${deal.title}`, lead: "Your deal is complete.", body: [`You paid ${usd(charged)}.${refund > 0 ? ` The other ${usd(refund)} of your hold was released back to you.` : ""} Thanks for trading safely.`], cta: "See the receipt" },
      };
    }
    case "RELEASED": {
      const why = lastNote ?? "The deal was cancelled.";
      return {
        seller: { subject: `Deal cancelled: ${deal.title}`, lead: "This deal was cancelled.", body: [why, "The buyer's hold was released. Nothing was paid."], cta: "See the deal" },
        buyer: { subject: `Deal cancelled: ${deal.title}. You weren't charged.`, lead: "Your hold was released in full.", body: [why, "You weren't charged anything."], cta: "See the deal" },
      };
    }
  }
}

// Sends each side its message for this change. Never throws: an email problem must never undo a money step.
export async function notifyChange(deal: Deal, prev: DealStatus | "NEW") {
  const msgs = messagesFor(deal, prev);
  await Promise.all(
    (Object.keys(msgs) as Role[]).map(async (role) => {
      const c = deal.contacts?.[role];
      const m = msgs[role];
      if (!c || !m || !c.confirmed || c.muted) return;
      const mail = render(deal, role, c, m, { footer: "deal" });
      await sendEmail({ to: c.email, ...mail, unsubscribeUrl: oneClickUnsubscribe(deal, role, c), idempotencyKey: `${deal.id}-${role}-${prev}-${deal.status}-${deal.updatedAt}` }).catch((e) =>
        console.error("email", deal.id, role, deal.status, (e as Error).message),
      );
    }),
  );
}

// Parcel milestones from the carrier. They don't change the deal's status, so they're announced here.
export function trackingMessages(deal: Deal, milestone: "out_for_delivery" | "delivered" | "failure"): Partial<Record<Role, Message>> {
  const t = deal.shipment?.tracking;
  const suspicious = t?.flags.some((f) => f === "WRONG_ZIP" || f === "DELIVERED_BEFORE_SHIPPED" || f === "REUSED_NUMBER");
  if (milestone === "out_for_delivery") {
    return { buyer: { subject: `${deal.title} is out for delivery`, lead: "It's arriving today.", body: [`Check it against what ${deal.sellerName} promised before you confirm. If anything's wrong, report it with a photo; your money stays on hold.`], cta: "Open your deal" } };
  }
  if (milestone === "delivered") {
    const by = deadline(deal, "AUTO_RELEASE");
    const where = t?.deliveredPlace && !t.test ? ` in ${t.deliveredPlace}` : "";
    if (suspicious) {
      return {
        buyer: { subject: `Check this delivery: ${deal.title}`, lead: "The carrier says it was delivered, but something doesn't add up.", body: ["The delivery doesn't match your PayPal address or this shipment. If you don't have it, report it: the payment stays on hold and won't be released on its own."], cta: "Review the delivery" },
      };
    }
    return {
      buyer: { subject: `${deal.title} was delivered. Check it.`, lead: `It was delivered${where}.`, body: ["Check it against the listing, then confirm it, or report a problem with a photo.", by ? `If you don't respond by ${by}, payment is released to ${deal.sellerName}.` : ""].filter(Boolean), cta: "Check it" },
      seller: { subject: `Delivered: ${deal.title}`, lead: "Your buyer has it.", body: [by ? `They have until ${by} to check it. If they don't report a problem, you're paid automatically.` : "Once they confirm it, you're paid."], cta: "Open your deal" },
    };
  }
  return {
    buyer: { subject: `The carrier reports a problem with ${deal.title}`, lead: "The carrier reports a problem with your parcel.", body: ["Your money is still on hold. If it doesn't arrive, report it and you won't be charged."], cta: "Open your deal" },
    seller: { subject: `Delivery problem: ${deal.title}`, lead: "The carrier reports a problem with the parcel.", body: ["Contact the carrier about it. The buyer's payment stays on hold until it's sorted."], cta: "Open your deal" },
  };
}

// Fire and forget, like status emails: a parcel email can never hold up or undo anything.
export function announceTracking(deal: Deal, milestones: ("out_for_delivery" | "delivered" | "failure")[]) {
  if (!milestones.length) return;
  const snapshot = structuredClone(deal);
  Promise.all(
    milestones.flatMap((m) =>
      (Object.entries(trackingMessages(snapshot, m)) as [Role, Message][]).map(async ([role, msg]) => {
        const c = snapshot.contacts?.[role];
        if (!c || !c.confirmed || c.muted) return;
        const mail = render(snapshot, role, c, msg, { footer: "deal" });
        await sendEmail({ to: c.email, ...mail, unsubscribeUrl: oneClickUnsubscribe(snapshot, role, c), idempotencyKey: `${snapshot.id}-${role}-parcel-${m}` });
      }),
    ),
  ).catch((e) => console.error("tracking email", deal.id, (e as Error).message));
}

// A typed-in address gets one email asking to confirm; nothing else is sent until it's confirmed.
export async function sendConfirmation(deal: Deal, role: Role) {
  const c = deal.contacts?.[role];
  if (!c) return;
  const mail = render(
    deal,
    role,
    c,
    // Fixed wording only: this goes to an address that hasn't agreed to anything yet, so nothing a
    // stranger wrote (the item title, a name) may appear in it.
    // The side is named (fixed wording, not stranger-written), so a seller's and a buyer's confirmation
    // never look identical and get folded into one conversation by the mail app.
    { subject: `Confirm ${role} updates for your Handshake deal`, lead: `Confirm your email for ${role} updates.`, body: [`Someone asked for updates on a Handshake deal, as the ${role}, to be sent to this address. If that was you, confirm below. If not, ignore this email and nothing more will be sent.`], cta: `Confirm ${role} updates`, ctaUrl: settingsLink(deal, role, c, "confirm") },
    { footer: "confirm", neutral: true },
  );
  await sendEmail({ to: c.email, ...mail, idempotencyKey: `${deal.id}-${role}-confirm-${c.token}` });
}
