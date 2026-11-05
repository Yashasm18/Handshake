import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { deliverable, normalizeEmail, validEmail } from "./email";
import { getDeal, HttpError, withDeal } from "./deals";
import { newContactToken, sendConfirmation } from "./notify";

type Role = "seller" | "buyer";

// At most 3 confirmation emails per side of a deal per day, so a deal can't be used to spam an inbox.
export const CONFIRM_LIMIT = 3;
const DAY = 24 * 60 * 60 * 1000;
// Per inbox, across every deal: each person asking may send it 2 confirmations a day, and the inbox
// gets at most 10 a day in total. So more deals can't flood an inbox, and one person can't use up
// someone else's allowance and lock them out of confirming their own address. The table is keyed by
// hashes, so it never holds anyone's email.
export const PER_REQUESTER = 2;
export const PER_INBOX = 10;
const sends = new Map<string, { at: number; by: string }[]>();

// The real mailbox behind an address: case, +tags and (for Gmail) dots don't make a new inbox.
export function mailbox(email: string) {
  let [user, domain] = email.toLowerCase().split("@");
  if (domain === "googlemail.com") domain = "gmail.com";
  user = user.split("+")[0];
  if (domain === "gmail.com") user = user.replace(/\./g, "");
  return `${user}@${domain}`;
}

const hash = (s: string) => createHash("sha256").update(s).digest("base64url");

function takeInboxSend(email: string, requester: string, now: number) {
  const key = hash(mailbox(email));
  const by = hash(requester);
  const recent = (sends.get(key) ?? []).filter((x) => now - x.at < DAY);
  if (recent.length >= PER_INBOX || recent.filter((x) => x.by === by).length >= PER_REQUESTER) return false;
  sends.set(key, [...recent, { at: now, by }]);
  if (sends.size > 10_000) for (const [k, xs] of sends) if (!xs.some((x) => now - x.at < DAY)) sends.delete(k);
  return true;
}

// The caller has already proven they hold this side of the deal.
export const setContactEmail = (id: string, role: Role, raw: string, requester = "unknown") =>
  withDeal(id, async (deal) => {
    const email = normalizeEmail(raw);
    if (!validEmail(email)) throw new HttpError(400, "That doesn't look like an email address.");
    if (!deliverable(email)) throw new HttpError(400, "That address can't receive email. PayPal sandbox addresses are made up; use your real one.");
    const current = deal.contacts?.[role];
    // Re-entering the address that's already confirmed changes nothing (and unmutes it).
    if (current && current.email === email && current.confirmed) {
      current.muted = false;
      return { pending: false };
    }
    const now = Date.now();
    const recent = (current?.confirmSends ?? []).filter((t) => now - Date.parse(t) < DAY);
    if (recent.length >= CONFIRM_LIMIT) throw new HttpError(429, "Too many confirmation emails for this deal today. Try again tomorrow.");
    if (!takeInboxSend(email, requester, now)) throw new HttpError(429, "That address has had enough confirmation emails today. Try again tomorrow.");
    deal.contacts = {
      ...deal.contacts,
      [role]: { email, confirmed: false, token: newContactToken(), source: "typed", confirmSends: [...recent, new Date(now).toISOString()] },
    };
    try {
      await sendConfirmation(deal, role);
    } catch (e) {
      // Nothing is saved: the address only counts once its confirmation email has gone out.
      console.error("confirmation email", deal.id, role, (e as Error).message);
      throw new HttpError(502, "We couldn't send the confirmation email to that address. Check it, or try again in a few minutes.");
    }
    return { pending: true };
  });

export const setMuted = (id: string, role: Role, muted: boolean) =>
  withDeal(id, async (deal) => {
    const c = deal.contacts?.[role];
    if (!c) throw new HttpError(400, "Add an email first.");
    c.muted = muted;
    return { muted };
  });

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// From a link in an email: the token proves the person holds that inbox. Confirming twice is fine.
export const applyEmailLink = async (id: string, role: Role, token: string, action: "confirm" | "mute") => {
  if (!id || id.length > 40 || !token || token.length > 80 || !(await getDeal(id))) throw new HttpError(400, "This link is no longer valid. The address may have been changed.");
  return withDeal(id, async (deal) => {
    const c = deal.contacts?.[role];
    if (!c || !token || !same(token, c.token)) throw new HttpError(400, "This link is no longer valid. The address may have been changed.");
    if (action === "confirm") {
      c.confirmed = true;
      c.muted = false;
    } else c.muted = true;
    return { action, title: deal.title };
  });
};
