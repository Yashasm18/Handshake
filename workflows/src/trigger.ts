import { Render } from "@renderinc/sdk";

// Render Workflows don't schedule runs themselves yet, so a Render cron job runs this every few
// minutes to start one sweep. The idempotency key keeps a retried cron tick from starting a second one.
const slug = `${process.env.WORKFLOW_SLUG ?? "handshake-timers"}/sweepDeals`;
const tick = new Date().toISOString().slice(0, 16); // one key per minute

const run = await new Render().workflows.startTask(slug, [], { idempotencyKey: `sweep-${tick}` });
console.log(`Started ${slug} as ${run.taskRunId}`);
