import "server-only";
import { timingSafeEqual } from "node:crypto";
import { deliverable, normalizeEmail, validEmail } from "./email";
import { HttpError, withDeal } from "./deals";
import { newContactToken, sendConfirmation } from "./notify";

type Role = "seller" | "buyer";

// At most 3 confirmation emails per side of a deal per day, so a deal can't be used to spam an inbox.
export const CONFIRM_LIMIT = 3;
const DAY = 24 * 60 * 60 * 1000;

// The caller has already proven they hold this side of the deal.
export const setContactEmail = (id: string, role: Role, raw: string) =>
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
    deal.contacts = {
      ...deal.contacts,
      [role]: { email, confirmed: false, token: newContactToken(), source: "typed", confirmSends: [...recent, new Date(now).toISOString()] },
    };
    await sendConfirmation(deal, role);
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
export const applyEmailLink = (id: string, role: Role, token: string, action: "confirm" | "mute") =>
  withDeal(id, async (deal) => {
    const c = deal.contacts?.[role];
    if (!c || !token || !same(token, c.token)) throw new HttpError(400, "This link is no longer valid. The address may have been changed.");
    if (action === "confirm") {
      c.confirmed = true;
      c.muted = false;
    } else c.muted = true;
    return { action, title: deal.title };
  });
