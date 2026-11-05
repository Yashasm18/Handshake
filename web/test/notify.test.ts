import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-notify-"));
process.env.APP_URL = "https://handshake.example.app";
delete process.env.RESEND_API_KEY;

// Email updates: who hears what at each step, that nothing goes to unconfirmed or muted addresses,
// that typed-in addresses must be confirmed from the inbox, and that emails carry no private details.
const pp = vi.hoisted(() => ({
  createTestCardHold: vi.fn(async (_id: string, _t: string, cents: number) => ({
    id: "ORDER-T",
    status: "COMPLETED",
    purchase_units: [{
      shipping: { name: { full_name: "Bo Buyer" }, address: { address_line_1: "1 Main Street", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131" } },
      payments: { authorizations: [{ id: "AUTH-T", status: "CREATED", amount: { value: (cents / 100).toFixed(2) } }] },
    }],
  })),
  voidHold: vi.fn(async () => ({})),
  captureHold: vi.fn(async (_a: string, cents: number) => ({
    id: "CAP-T",
    status: "COMPLETED",
    seller_receivable_breakdown: { gross_amount: { value: (cents / 100).toFixed(2) }, paypal_fee: { value: "5.15" }, net_amount: { value: (cents / 100 - 5.15).toFixed(2) } },
  })),
  addTracking: vi.fn(async () => ({})),
  payoutSeller: vi.fn(async () => ({ batch_header: { payout_batch_id: "BATCH-T", batch_status: "PENDING" } })),
  getPayoutBatch: vi.fn(async (id: string) => ({ batch_header: { payout_batch_id: id, batch_status: "SUCCESS" }, items: [{ payout_item_id: "ITEM", transaction_status: "SUCCESS" }] })),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));
vi.mock("@/lib/server/negotiate", async (orig) => ({ ...(await orig<typeof import("@/lib/server/negotiate")>()), runNegotiation: vi.fn() }));

const { outbox, deliverable, maskEmail, validEmail } = await import("@/lib/server/email");
const { messagesFor, notifyChange } = await import("@/lib/server/notify");
const contacts = await import("@/lib/server/contacts");
const flows = await import("@/lib/server/flows");
const { saveDeal, getDeal, announce } = await import("@/lib/server/deals");
const { publicDeal } = await import("@/lib/server/auth");

const flush = () => new Promise((r) => setTimeout(r, 30));
const SELLER = { email: "sam@gmail.com", confirmed: true, token: "seller-token-xxxxxxxxxxxx", source: "paypal" as const };
const BUYER = { email: "bo@outlook.com", confirmed: true, token: "buyer-token-xxxxxxxxxxxxx", source: "typed" as const };
let n = 0;

async function newDeal(over: Partial<Deal> = {}) {
  const deal: Deal = {
    id: `mail-${++n}-xxxxxxxxxxxxxx`, createdAt: "", updatedAt: "", title: "Sony WH-1000XM5", priceCents: 18_000, condition: "Used",
    checklist: ["Case included"], sellerName: "Sam", sellerEmail: "", scan: null, status: "AWAITING_PAYMENT", demo: false,
    paypal: {}, events: [], contacts: { seller: { ...SELLER }, buyer: { ...BUYER } }, ...over,
  };
  await saveDeal(deal);
  return deal.id;
}

const to = (addr: string) => outbox.filter((m) => m.to === addr);

// A buyer only exists once they pay, so their address is attached after the hold (as in the app).
async function fundWithBuyer(id: string) {
  await flows.fundWithTestCard(id, async () => {});
  const deal = (await getDeal(id))!;
  deal.contacts = { ...deal.contacts, buyer: { ...BUYER } };
  await saveDeal(deal);
}
beforeEach(() => {
  outbox.length = 0;
});

describe("addresses", () => {
  it("PayPal sandbox and reserved addresses can't receive email", () => {
    for (const a of ["sb-7vsbq53693637@personal.example.com", "x@example.com", "a@b.test", "a@b.invalid", "a@localhost.localhost"]) expect(deliverable(a)).toBe(false);
    for (const a of ["ygowdam@gmail.com", "bo@outlook.com", "x@mail.handshake.app"]) expect(deliverable(a)).toBe(true);
  });

  it("rejects malformed addresses and header injection", () => {
    for (const a of ["", "no-at", "a@b", "a b@c.com", "a@b.com\nBcc: x@y.com", "<a@b.com>", "a@b.com, c@d.com"]) expect(validEmail(a)).toBe(false);
  });

  it("masks an address for display", () => {
    expect(maskEmail("ygowdam@gmail.com")).toBe("y•••@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
  });
});

describe("who hears what", () => {
  it("each step emails the person who has to act next", async () => {
    const id = await newDeal();
    await flows.fundWithTestCard(id, async () => {}, undefined);
    await flush();
    expect(to(SELLER.email).at(-1)!.subject).toContain("is held for Sony WH-1000XM5. Ship it.");
    // The buyer who just paid hears too, once their address is known (here, from signing in).
    const deal = (await getDeal(id))!;
    deal.contacts = { ...deal.contacts, buyer: { ...BUYER } };
    await saveDeal(deal);

    outbox.length = 0;
    await flows.ship(id, { carrier: "UPS", trackingNumber: "1Z999" });
    await flush();
    expect(to(SELLER.email)).toHaveLength(0);
    expect(to(BUYER.email)[0].subject).toBe("Sony WH-1000XM5 is on its way");
    expect(to(BUYER.email)[0].text).toContain("UPS tracking: 1Z999");

    outbox.length = 0;
    await flows.confirmDelivery(id);
    await flush();
    expect(to(SELLER.email)[0].subject).toBe("You've been paid $174.85 for Sony WH-1000XM5");
    expect(to(SELLER.email)[0].text).toContain("after its $5.15 fee");
    expect(to(BUYER.email)[0].subject).toBe("Deal complete: Sony WH-1000XM5");
  });

  it("the seller's email says when to ship by, and never includes the buyer's address", async () => {
    const id = await newDeal();
    await flows.fundWithTestCard(id, async () => {});
    await flush();
    const mail = to(SELLER.email).at(-1)!;
    expect(mail.text).toMatch(/Ship by \w+day/);
    for (const secret of ["1 Main Street", "95131", "Bo Buyer"]) {
      expect(mail.html).not.toContain(secret);
      expect(mail.text).not.toContain(secret);
    }
  });

  it("an in-person deal says meet, not ship", async () => {
    const id = await newDeal({ handoff: "meet" });
    await flows.fundWithTestCard(id, async () => {});
    await flush();
    expect(to(SELLER.email).at(-1)!.subject).toContain("Time to meet");
    expect(to(SELLER.email).at(-1)!.text).toMatch(/Meet by/);
  });

  it("a cancelled deal tells both sides nobody was charged", async () => {
    const id = await newDeal();
    await fundWithBuyer(id);
    await flush();
    outbox.length = 0;
    await flows.cancel(id, "seller");
    await flush();
    expect(to(BUYER.email)[0].subject).toContain("You weren't charged");
    expect(to(SELLER.email)[0].subject).toContain("Deal cancelled");
  });

  it("a new deal sends the seller their link", async () => {
    const id = await newDeal();
    announce((await getDeal(id))!, "NEW");
    await flush();
    expect(to(SELLER.email)[0].subject).toContain("is ready");
    expect(to(SELLER.email)[0].text).toContain(`https://handshake.example.app/d/${id}?as=seller`);
    expect(to(BUYER.email)).toHaveLength(0);
  });

  it("every update has a one-click unsubscribe and a link to stop emails", async () => {
    const id = await newDeal();
    await flows.fundWithTestCard(id, async () => {});
    await flush();
    const mail = to(SELLER.email).at(-1)!;
    expect(mail.unsubscribeUrl).toBe(`https://handshake.example.app/api/email/unsubscribe?d=${id}&r=seller&t=${SELLER.token}`);
    expect(mail.html).toContain("Stop emails for this deal");
    // The buyer's token is never in the seller's email.
    expect(mail.html).not.toContain(BUYER.token);
  });

  it("listing text is escaped in the HTML", async () => {
    const deal = (await getDeal(await newDeal({ title: `<img src=x onerror=alert(1)> "Switch"` })))!;
    deal.status = "HELD";
    deal.clock = { heldAt: new Date().toISOString() };
    await notifyChange(deal, "AWAITING_PAYMENT");
    const mail = to(SELLER.email)[0];
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt; &quot;Switch&quot;");
  });

  it("stays quiet when nothing needs anyone", async () => {
    const deal = (await getDeal(await newDeal()))!;
    expect(messagesFor(deal, "AWAITING_PAYMENT")).toEqual({});
  });
});

describe("nothing goes where it shouldn't", () => {
  it("not to an unconfirmed, muted or sandbox address", async () => {
    const id = await newDeal({
      contacts: {
        seller: { ...SELLER, confirmed: false },
        buyer: { ...BUYER, muted: true },
      },
    });
    await flows.fundWithTestCard(id, async () => {});
    await flush();
    expect(outbox).toHaveLength(0);

    const id2 = await newDeal({ contacts: { seller: { ...SELLER, email: "sb-1@personal.example.com" } } });
    await flows.fundWithTestCard(id2, async () => {});
    await flush();
    expect(outbox).toHaveLength(0);
  });

  it("a failing email never undoes a money step", async () => {
    const id = await newDeal();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "down" }, { status: 500 })));
    await flows.fundWithTestCard(id, async () => {});
    await flush();
    expect((await getDeal(id))!.status).toBe("HELD");
    expect(spy).toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    spy.mockRestore();
  });

  it("the deal view shows each person only their own address, masked", async () => {
    const deal = (await getDeal(await newDeal()))!;
    const asSeller = publicDeal(deal, { seller: true, buyer: false });
    expect(asSeller.notify.seller).toMatchObject({ email: "s•••@gmail.com", confirmed: true });
    expect(asSeller.notify.buyer).toBeUndefined();
    const json = JSON.stringify([asSeller, publicDeal(deal, { seller: false, buyer: true }), publicDeal(deal, { seller: false, buyer: false })]);
    for (const secret of [SELLER.email, BUYER.email, SELLER.token, BUYER.token]) expect(json).not.toContain(secret);
  });
});

describe("typing in an address", () => {
  it("sends one confirmation and nothing else until it's confirmed", async () => {
    const id = await newDeal({ contacts: {} });
    await flows.fundWithTestCard(id, async () => {});
    await flush();
    outbox.length = 0;
    expect(await contacts.setContactEmail(id, "buyer", "  New@Gmail.com ")).toEqual({ pending: true });
    const c = (await getDeal(id))!.contacts!.buyer!;
    expect(c).toMatchObject({ email: "new@gmail.com", confirmed: false, source: "typed" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe("Confirm buyer updates for your Handshake deal");
    expect(outbox[0].html).toContain(`/email?d=${id}&amp;r=buyer&amp;t=${c.token}&amp;a=confirm`);

    outbox.length = 0;
    await flows.ship(id, { carrier: "UPS", trackingNumber: "1Z1" });
    await flush();
    expect(outbox).toHaveLength(0);

    await contacts.applyEmailLink(id, "buyer", c.token, "confirm");
    await flows.confirmDelivery(id);
    await flush();
    expect(to("new@gmail.com")[0].subject).toContain("Deal complete");
  });

  it("refuses sandbox and malformed addresses", async () => {
    const id = await newDeal({ contacts: {} });
    await expect(contacts.setContactEmail(id, "seller", "sb-7vsbq53693637@personal.example.com")).rejects.toThrow(/sandbox/);
    await expect(contacts.setContactEmail(id, "seller", "not an email")).rejects.toThrow(/doesn't look like/);
    expect(outbox).toHaveLength(0);
  });

  it("a confirmation email carries nothing a stranger wrote: no title, no name", async () => {
    const id = await newDeal({ contacts: {}, title: "URGENT your PayPal is locked call 1-800-555-0100", sellerName: "PayPal Support" });
    await contacts.setContactEmail(id, "buyer", "victim@gmail.com");
    const mail = to("victim@gmail.com")[0];
    for (const text of [mail.subject, mail.html, mail.text]) {
      expect(text).not.toContain("URGENT");
      expect(text).not.toContain("1-800");
      expect(text).not.toContain("PayPal Support");
    }
  });

  it("making more deals can't flood one inbox, and +tags or Gmail dots don't count as a new inbox", async () => {
    const fresh = async () => newDeal({ contacts: {} });
    await contacts.setContactEmail(await fresh(), "buyer", "target@gmail.com", "attacker");
    await contacts.setContactEmail(await fresh(), "buyer", "t.a.r.g.e.t+1@googlemail.com", "attacker");
    await expect(contacts.setContactEmail(await fresh(), "buyer", "TARGET+spam@gmail.com", "attacker")).rejects.toThrow(/enough confirmation emails/);
    expect(contacts.mailbox("T.a.r.g.e.t+x@GoogleMail.com")).toBe("target@gmail.com");
    expect(contacts.mailbox("first.last+x@outlook.com")).toBe("first.last@outlook.com");
  });

  it("one person using up their allowance can't lock the owner out of confirming", async () => {
    const fresh = async () => newDeal({ contacts: {} });
    for (let i = 0; i < 2; i++) await contacts.setContactEmail(await fresh(), "buyer", "owner@gmail.com", "attacker");
    await expect(contacts.setContactEmail(await fresh(), "buyer", "owner@gmail.com", "attacker")).rejects.toThrow(/enough/);
    await expect(contacts.setContactEmail(await fresh(), "buyer", "owner@gmail.com", "the-owner")).resolves.toEqual({ pending: true });
  });

  it("an inbox gets at most 10 confirmations a day, however many people ask", async () => {
    const fresh = async () => newDeal({ contacts: {} });
    for (let i = 0; i < 10; i++) await contacts.setContactEmail(await fresh(), "buyer", "popular@gmail.com", `person-${i}`);
    await expect(contacts.setContactEmail(await fresh(), "buyer", "popular@gmail.com", "person-11")).rejects.toThrow(/enough/);
  });

  it("can't be used to spam an inbox: 3 confirmations per side per day", async () => {
    const id = await newDeal({ contacts: {} });
    for (const a of ["a1@gmail.com", "a2@gmail.com", "a3@gmail.com"]) await contacts.setContactEmail(id, "seller", a);
    await expect(contacts.setContactEmail(id, "seller", "a4@gmail.com")).rejects.toThrow(/Too many/);
    expect(outbox).toHaveLength(3);
  });

  it("re-entering a confirmed address sends nothing and turns emails back on", async () => {
    const id = await newDeal({ contacts: { seller: { ...SELLER, muted: true } } });
    expect(await contacts.setContactEmail(id, "seller", "SAM@gmail.com")).toEqual({ pending: false });
    expect(outbox).toHaveLength(0);
    expect((await getDeal(id))!.contacts!.seller!.muted).toBe(false);
  });

  it("a confirm or stop link only works with that address's own token", async () => {
    const id = await newDeal();
    await expect(contacts.applyEmailLink(id, "seller", BUYER.token, "mute")).rejects.toThrow(/no longer valid/);
    await expect(contacts.applyEmailLink(id, "seller", "", "mute")).rejects.toThrow(/no longer valid/);
    await contacts.applyEmailLink(id, "seller", SELLER.token, "mute");
    expect((await getDeal(id))!.contacts!.seller!.muted).toBe(true);
  });

  it("changing the address invalidates the old links", async () => {
    const id = await newDeal();
    await contacts.setContactEmail(id, "seller", "other@gmail.com");
    await expect(contacts.applyEmailLink(id, "seller", SELLER.token, "confirm")).rejects.toThrow(/no longer valid/);
  });
});

const route = await import("@/app/api/email/unsubscribe/route");

describe("a buyer whose offer fell through", () => {
  it("loses access and stops getting emails once someone else pays", async () => {
    const id = await newDeal({ buyer: { payerId: "OLDBUYER", name: "Old", verified: true } });
    await flows.fundWithTestCard(id, async () => {});
    const deal = (await getDeal(id))!;
    expect(deal.buyer).toBeUndefined();
    expect(deal.contacts?.buyer).toBeUndefined();
  });

  it("an email link for a deal that doesn't exist is refused without touching anything", async () => {
    await expect(contacts.applyEmailLink("no-such-deal-xxxxxxxx", "seller", "whatever-token-xx", "mute")).rejects.toThrow(/no longer valid/);
    await expect(contacts.applyEmailLink("x".repeat(500), "seller", "t".repeat(500), "mute")).rejects.toThrow(/no longer valid/);
  });
});

describe("unsubscribe endpoint", () => {
  it("opening the link changes nothing (mail scanners open links); the one-click POST mutes", async () => {
    const id = await newDeal();
    const url = `https://h.example/api/email/unsubscribe?d=${id}&r=seller&t=${SELLER.token}`;
    const get = await route.GET(new Request(url));
    expect(get.status).toBe(303);
    expect((await getDeal(id))!.contacts!.seller!.muted).toBeFalsy();
    expect((await route.POST(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status).toBe(200);
    expect((await getDeal(id))!.contacts!.seller!.muted).toBe(true);
    expect((await route.POST(new Request(url.replace(SELLER.token, "wrong-token-xxxxxxxxxx"), { method: "POST" }))).status).toBe(400);
  });
});
