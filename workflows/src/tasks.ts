import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { RetryableError, enforce, listDue, type Result } from "./handshake.js";

// One run per deadline, on its own instance, retried with backoff if PayPal or the app hiccups.
// The app re-checks the deadline inside the deal's lock, so a retry after a success is a no-op.
export const enforceDeadline = task(
  {
    name: "enforceDeadline",
    retry: { maxRetries: 4, waitDurationMs: 5_000, backoffScaling: 2 },
    timeoutSeconds: 120,
  },
  async function enforceDeadline(_ctx: TaskContext, dealId: string, kind: string): Promise<Result> {
    try {
      return await enforce(dealId, kind);
    } catch (e) {
      // Throwing makes Render retry the run, which only helps for transient failures.
      if (e instanceof RetryableError) throw e;
      return { dealId, kind, outcome: "rejected", detail: (e as Error).message };
    }
  },
);

// Started by the cron job: finds every deal past a deadline and fans out one enforceDeadline run each.
export const sweepDeals = task(
  {
    name: "sweepDeals",
    retry: { maxRetries: 2, waitDurationMs: 10_000 },
    timeoutSeconds: 900,
  },
  async function sweepDeals(ctx: TaskContext) {
    const due = await listDue();
    const runs = await Promise.allSettled(due.map((d) => ctx.run(enforceDeadline, d.dealId, d.kind)));
    const results = runs.map((r, i) => (r.status === "fulfilled" ? r.value : { ...due[i], outcome: "failed", detail: String(r.reason) }));
    return {
      checked: due.length,
      done: results.filter((r) => r.outcome === "done").length,
      failed: results.filter((r) => r.outcome === "failed" || r.outcome === "rejected").length,
      results,
    };
  },
);
