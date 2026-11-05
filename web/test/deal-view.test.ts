import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Deal } from "@/lib/types";

// Looking at a deal on Render (where the timer workflow owns deadlines) finishes a payout PayPal was
// still processing as soon as its check is due, instead of waiting for the next 5-minute sweep. It never
// runs any other deadline, and a page polling every few seconds triggers one check at a time.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "hs-view-"));
process.env.TIMERS_SECRET = "workflow-owns-deadlines";

const pp = vi.hoisted(() => ({
  voidHold: vi.fn(async () => ({})),
  payoutSeller: vi.fn(async () => ({ batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } })),
  getPayoutBatch: vi.fn(async (id: string) => {
    await new Promise((r) => setTimeout(r, 30));
    return { batch_header: { payout_batch_id: id, batch_status: "SUCCESS" }, items: [{ payout_item_id: "I", transaction_status: "SUCCESS" }] };
  }),
}));
vi.mock("@/lib/server/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/server/paypal")>()), ...pp }));

const { GET } = await import("@/app/api/deals/[id]/route");
const { saveDeal, getDeal } = await import("@/lib/server/deals");

const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.now();
let n = 0;
const deal = (over: Partial<Deal>): Deal => ({
  id: `view-${++n}-xxxxxxxxxxxxxxxx`, createdAt: iso(NOW - 3600_000), updatedAt: iso(NOW), title: "Switch OLED", priceCents: 23_000, condition: "",
  checklist: [], sellerName: "Sam", sellerEmail: "s@example.com", scan: null, status: "HELD", demo: false,
  paypal: { orderId: "O", authorizationId: "A" }, events: [], clock: { heldAt: iso(NOW - 3600_000), authorizedAt: iso(NOW - 3600_000) }, ...over,
});
const view = (id: string) => GET(new Request(`http://x/api/deals/${id}`), { params: Promise.resolve({ id }) } as never);
const settled = async (id: string) => {
  for (let i = 0; i < 50 && (await getDeal(id))!.status !== "SETTLED"; i++) await new Promise((r) => setTimeout(r, 20));
  return (await getDeal(id))!;
};

describe("viewing a deal", () => {
  it("finishes a pending payout whose check is due, once, even with the page polling", async () => {
    const d = await saveDeal(deal({
      paypal: { orderId: "O", authorizationId: "A", captureId: "CAP", capturedCents: 23_000, feeCents: 100, netCents: 22_900, payoutBatchId: "BATCH-1", payoutStatus: "pending", payoutChecks: 1, payoutRetryAt: iso(NOW - 1000) },
    }));
    await Promise.all([view(d.id), view(d.id), view(d.id)]);
    const after = await settled(d.id);
    expect(after.status).toBe("SETTLED");
    expect(pp.getPayoutBatch).toHaveBeenCalledTimes(1);
    expect(pp.payoutSeller).not.toHaveBeenCalled();
    expect(after.events.filter((e) => e.text.startsWith("Paid"))).toHaveLength(1);
  });

  it("doesn't check early, and never runs other deadlines (those belong to the timer workflow)", async () => {
    pp.getPayoutBatch.mockClear();
    const notYet = await saveDeal(deal({
      paypal: { orderId: "O", authorizationId: "A", captureId: "CAP", capturedCents: 23_000, netCents: 22_900, payoutBatchId: "BATCH-2", payoutStatus: "pending", payoutRetryAt: iso(NOW + 60_000) },
    }));
    // Paid four days ago and never shipped: its ship-by deadline has passed, but viewing doesn't void it.
    const overdue = await saveDeal(deal({ clock: { heldAt: iso(NOW - 4 * 86_400_000), authorizedAt: iso(NOW - 4 * 86_400_000) } }));
    await view(notYet.id);
    await view(overdue.id);
    await new Promise((r) => setTimeout(r, 100));
    expect(pp.getPayoutBatch).not.toHaveBeenCalled();
    expect(pp.voidHold).not.toHaveBeenCalled();
    expect((await getDeal(overdue.id))!.status).toBe("HELD");
  });
});
