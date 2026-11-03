import { Render } from "@renderinc/sdk";

// Render Workflows don't schedule runs themselves yet, so a Render cron job runs this every few
// minutes to start one sweep. The idempotency key keeps a retried cron tick from starting a second one.
if (!process.env.RENDER_API_KEY) {
  console.error("RENDER_API_KEY is not set. Add a Render API key (Account Settings → API Keys) in this cron job's Environment.");
  process.exit(1);
}

const slug = `${process.env.WORKFLOW_SLUG ?? "handshake-timers"}/sweepDeals`;
const tick = new Date().toISOString().slice(0, 16); // one key per minute

const run = await new Render().workflows.startTask(slug, [], { idempotencyKey: `sweep-${tick}` });
console.log(`Started ${slug} as ${run.taskRunId}`);
