import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAY } from "@/lib/deadlines";
import type { Contact, Deal } from "@/lib/types";

// A day before a deadline the timer would act on, whoever has to act gets one reminder: the seller to
// ship, both sides to meet, the buyer to check the item, both to answer a refund proposal.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-remind-"));

type Sent = { to: string; subject: string; text: string; idempotencyKey?: string };
const mail = vi.hoisted(() => ({ sendEmail: vi.fn<(m: Sent) => Promise<{ id: string }>>(async () => ({ id: "m" })) }));
vi.mock("@/lib/server/email", async (orig) => ({ ...(await orig<typeof import("@/lib/server/email")>()), sendEmail: mail.sendEmail, emailEnabled: () => true }));

const { sendDueReminders, remindersDue } = await import("@/lib/server/reminders");
const { saveDeal, getDeal } = await import("@/lib/server/deals");

const T0 = Date.parse("2026-11-01T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const contact = (email: string, over: Partial<Contact> = {}): Contact => ({ email, confirmed: true, token: `t-${email}`, source: "paypal", ...over });
let n = 0;
const deal = (over: Partial<Deal>): Deal => ({
  id: `remind-${++n}-xxxxxxxxxxxxxx`, createdAt: iso(T0), updatedAt: iso(T0), title: "Switch OLED", priceCents: 23_000, condition: "", checklist: [],
  sellerName: "Sam", sellerEmail: "", scan: null, status: "HELD", demo: false, paypal: { orderId: "O", authorizationId: "A" }, events: [],
  clock: { heldAt: iso(T0), authorizedAt: iso(T0) }, contacts: { seller: contact("sam@example.com"), buyer: contact("bo@example.com") }, ...over,
});
const sent = () => mail.sendEmail.mock.calls.map(([m]) => ({ to: m.to, subject: m.subject }));

beforeEach(async () => {
  mail.sendEmail.mockClear();
  // Each test starts with no open deals from earlier tests in its reminder window.
  const { openDeals } = await import("@/lib/server/deals");
  for (const d of await openDeals()) await saveDeal({ ...d, status: "SETTLED" });
});

describe("deadline reminders", () => {
  it("reminds the seller to ship once, inside the last day, never before", async () => {
    const d = await saveDeal(deal({}));
    const shipBy = T0 + 3 * DAY;
    expect(await sendDueReminders(shipBy - 2 * DAY)).toBe(0);
    expect(await sendDueReminders(shipBy - 23 * 3600_000)).toBe(1);
    expect(sent()).toEqual([{ to: "sam@example.com", subject: expect.stringMatching(/^Reminder: ship Switch OLED by /) }]);
    const text = mail.sendEmail.mock.calls[0][0].text;
    expect(text).toContain("23h 00m left to ship.");
    expect(text).toContain("the buyer's $230 hold is released and you won't be paid");
    // The next sweeps send nothing more.
    expect(await sendDueReminders(shipBy - 22 * 3600_000)).toBe(0);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
    expect((await getDeal(d.id))!.reminded).toEqual([`SHIP_BY@${shipBy}`]);
  });

  it("a deadline that has passed gets no reminder: the timer acts instead", async () => {
    await saveDeal(deal({}));
    expect(await sendDueReminders(T0 + 3 * DAY + 60_000)).toBe(0);
  });

  it("for a meetup, both sides are reminded", async () => {
    await saveDeal(deal({ handoff: "meet" }));
    await sendDueReminders(T0 + 2.5 * DAY);
    expect(sent().map((s) => [s.to, s.subject])).toEqual([
      ["sam@example.com", expect.stringMatching(/^Reminder: meet your buyer by /)],
      ["bo@example.com", expect.stringMatching(/^Reminder: meet Sam by /)],
    ]);
  });

  it("after a verified shipment, the buyer is reminded to check it before payment releases", async () => {
    await saveDeal(deal({ status: "SHIPPED", clock: { heldAt: iso(T0), authorizedAt: iso(T0), reauthorizedAt: iso(T0), shippedAt: iso(T0) }, shipment: { carrier: "UPS", trackingNumber: "1Z", labelCheck: { match: true, read: "", reason: "" } } }));
    await sendDueReminders(T0 + 6.5 * DAY);
    expect(sent()).toEqual([{ to: "bo@example.com", subject: expect.stringMatching(/^Reminder: check Switch OLED by /) }]);
    expect(mail.sendEmail.mock.calls[0][0].text).toContain("the payment is released to Sam");
  });

  it("an open refund proposal reminds both sides of when it settles, with the amounts", async () => {
    await saveDeal(deal({
      status: "CLAIM_OPEN",
      clock: { heldAt: iso(T0), authorizedAt: iso(T0), reauthorizedAt: iso(T0), claimAt: iso(T0) },
      claim: { refundCents: 4_000, captureCents: 19_000 } as Deal["claim"],
    }));
    await sendDueReminders(T0 + 2.5 * DAY);
    expect(sent().map((s) => s.to)).toEqual(["sam@example.com", "bo@example.com"]);
    expect(mail.sendEmail.mock.calls[0][0].text).toContain("The buyer is refunded $40 and the seller is paid $190.");
  });

  it("deadlines Handshake handles itself (renewing a hold) send nothing", async () => {
    const d = deal({ status: "SHIPPED", clock: { heldAt: iso(T0), authorizedAt: iso(T0), shippedAt: iso(T0) }, shipment: { carrier: "UPS", trackingNumber: "1Z", labelCheck: null } });
    expect(remindersDue(d, T0 + 2.5 * DAY)).toEqual([]);
  });

  it("nothing goes to an address that isn't confirmed or has stopped emails for this deal", async () => {
    await saveDeal(deal({ handoff: "meet", contacts: { seller: contact("sam@example.com", { confirmed: false }), buyer: contact("bo@example.com", { muted: true }) } }));
    await sendDueReminders(T0 + 2.5 * DAY);
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it("two sweeps at the same moment (two servers) send each reminder once", async () => {
    await saveDeal(deal({}));
    const now = T0 + 2.5 * DAY;
    const counts = await Promise.all([sendDueReminders(now), sendDueReminders(now), sendDueReminders(now)]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(mail.sendEmail).toHaveBeenCalledTimes(1);
  });
});
