import { Nav } from "@/components/chrome";
import { ApiList, Docs, FeatureHero, Footer, Proof, REPO, Section, Steps, TryIt, repoFile, source } from "@/components/feature";
import { FadeIn } from "@/components/motion";

export const metadata = {
  title: "Render · Handshake",
  description: "How Handshake runs on Render: an always-on web service, a persistent disk, tests that gate every deploy, and a Render Workflow that enforces every deal deadline.",
};

// The real output of a sweep against the PayPal sandbox, with deadlines sped up for testing.
const SWEEP = [
  { k: "sweep 1", v: "3 deadlines due across 2 deals", tone: "muted" },
  { k: "SHIP_BY", v: "Seller never shipped → hold voided, buyer paid nothing", tone: "safe" },
  { k: "REAUTHORIZE", v: "PayPal's honor period not over → rescheduled, no error", tone: "held" },
  { k: "AUTO_RELEASE", v: "Buyer went quiet → $230 captured, seller paid $223.55", tone: "safe" },
  { k: "sweep 2", v: "0 due → nothing runs twice", tone: "muted" },
] as const;

const FLOW = [
  { t: "Render Cron", d: "every 5 min" },
  { t: "sweepDeals", d: "Workflow task" },
  { t: "enforceDeadline × N", d: "one run per deal" },
  { t: "Handshake app", d: "re-checks, then acts" },
  { t: "PayPal", d: "void · capture · renew" },
];

export default function RenderPage() {
  return (
    <>
      <Nav />
      <main>
        <FeatureHero
          eyebrow="Render · Hosting, Workflows, Cron"
          title={"Every deal has a clock.\nRender keeps it ticking."}
          lede="Sellers who never ship, buyers who go quiet, holds that get old: real deals stall. Handshake runs on Render, and a Render Workflow enforces every deadline automatically, even when nobody has the page open."
        />

        {/* How a deadline gets enforced, left to right */}
        <section className="mx-auto max-w-[1400px] px-5 md:px-10">
          <FadeIn className="island overflow-hidden rounded-[28px] bg-night p-6 text-paper md:p-10">
            <p className="label text-paper/50">How a deadline gets enforced</p>
            <div className="mt-8 grid gap-3 md:grid-cols-5 md:gap-0">
              {FLOW.map((s, i) => (
                <FadeIn key={s.t} delay={i * 0.1} className="relative flex items-center gap-3 md:block">
                  <div className="rounded-2xl border border-paper/15 bg-paper/5 px-4 py-4 md:mr-6">
                    <p className="font-display text-[19px] font-semibold tracking-tight">{s.t}</p>
                    <p className="label mt-1 text-paper/50">{s.d}</p>
                  </div>
                  {i < FLOW.length - 1 && <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-paper/40 md:block" aria-hidden>→</span>}
                </FadeIn>
              ))}
            </div>
            <div className="mt-10 rounded-2xl bg-paper/5 p-5 font-mono text-[13px] leading-relaxed md:p-7">
              <p className="label mb-4 text-paper/45">Real run · PayPal sandbox · deadlines sped up for the test</p>
              {SWEEP.map((l, i) => (
                <FadeIn key={l.k} delay={0.3 + i * 0.12} className="grid gap-0.5 py-1.5 md:grid-cols-[170px_1fr] md:gap-4 md:py-1">
                  <span className="text-paper/45">{l.k}</span>
                  <span className={l.tone === "safe" ? "text-safe" : l.tone === "held" ? "text-held" : "text-paper/70"}>{l.v}</span>
                </FadeIn>
              ))}
            </div>
          </FadeIn>
        </section>

        <Section
          eyebrow="The deadlines"
          title={"Nobody can stall\na deal anymore."}
          intro="Four timers run on every protected deal. Both people see a live countdown, and the workflow acts the moment one runs out."
        >
          <Steps
            steps={[
              { t: "Ship within 3 days", d: "The seller has three days from payment to ship. If they don't, the PayPal hold is voided and the buyer pays nothing.", tag: "Protects the buyer" },
              { t: "Renew the hold on day 3", d: "PayPal guarantees a hold for three days. Handshake reauthorizes it then, so the money stays reserved while the item travels.", tag: "PayPal reauthorize" },
              { t: "Respond within 7 days of shipping", d: "If the buyer neither confirms nor reports a problem, payment is captured and the seller is paid, but only when the seller's label photo matched the buyer's PayPal address. A typed tracking number never triggers it.", tag: "Protects the seller" },
              { t: "Settle claims within 3 days", d: "If nobody declines a damage proposal, the code-computed refund settles automatically. A decline sends it to PayPal instead.", tag: "Protects both" },
            ]}
          />
        </Section>

        <Section
          dark
          eyebrow="Built to move money safely"
          title={"Retries are safe.\nDuplicates are impossible."}
          intro="Background jobs that move money have one job: never do it twice. Every layer is built around that."
        >
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["The app re-checks every time", "The workflow decides when to act. The app checks the deadline again inside the deal's lock, so a retry after a success does nothing."],
              ["Retries only when they help", "Render retries a failed run with backoff. Only transient failures (a PayPal 5xx, a deploy in progress) throw; a bad request is reported, not retried."],
              ["One sweep per tick", "Each cron tick starts the sweep with an idempotency key, so a retried tick can't start a second one."],
              ["A secret nobody types", "The app and the workflow share a secret that Render generates in a Blueprint environment group. It never appears in code or chat."],
              ["Settlement resumes", "Capture, tracking and payout are recorded step by step. If the payout fails, the retry pays the seller without capturing twice."],
              ["Demo speed, same rules", "One setting shrinks days to minutes for demos. The order of events and every safety check stay exactly the same."],
            ].map(([h, p], i) => (
              <FadeIn key={h} delay={(i % 3) * 0.08} className="border-t border-paper/15 pt-6">
                <h3 className="font-display text-[22px] font-semibold tracking-tight">{h}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-paper/60">{p}</p>
              </FadeIn>
            ))}
          </div>
        </Section>

        <Section eyebrow="The whole stack" title={"One Blueprint.\nFour pieces."} intro="Everything is defined in a single render.yaml, so the whole system deploys from one file.">
          <Steps
            steps={[
              { t: "Web service", d: "The Next.js app and its API: deal pages, PayPal calls, AI checks. On the Starter plan, so it never sleeps and a judge's first click is instant.", tag: "Starter" },
              { t: "Persistent disk", d: "Deals live on a 1 GB disk, written atomically, so they survive redeploys and restarts.", tag: "1 GB disk" },
              { t: "Tests gate every deploy", d: "Render runs the money-rule tests before each build. If pricing, refund caps, negotiation limits or timers break, the deploy stops and the live site keeps working.", tag: "npm test" },
              { t: "Workflow + cron", d: "A Render Workflow with two tasks enforces deadlines, started every five minutes by a Render cron job.", tag: "Workflows" },
            ]}
          />
        </Section>

        <Section eyebrow="Proof" title={"Tested against\nthe real sandbox."}>
          <Proof
            stats={[
              { n: "3", t: "timer actions run against PayPal's sandbox: a void, a capture with payout, and a rescheduled renewal.", s: "End to end" },
              { n: "0", t: "duplicate money moves, across repeated sweeps and three simultaneous runs of the same deadline.", s: "Idempotency" },
              { n: "191", t: "automated tests across the app and the workflow, plus 35 live scenarios on the sandbox. The app's run before every deploy.", s: "Vitest + live runs" },
            ]}
          />
        </Section>

        <Section eyebrow="What we use" title="Under the hood.">
          <ApiList
            items={[
              { name: "sweepDeals task", call: "task({ name: 'sweepDeals' })", why: "Asks the app which deals are past a deadline and fans out one run per deal with ctx.run." },
              { name: "enforceDeadline task", call: "retry: { maxRetries: 4, backoffScaling: 2 }", why: "Each deadline runs on its own instance, retried with exponential backoff on transient failures." },
              { name: "Starting runs", call: "render.workflows.startTask()", why: "The cron job starts each sweep with an idempotency key, so a retried tick can't double up." },
              { name: "Cron job", call: 'schedule: "*/5 * * * *"', why: "Render Workflows don't schedule themselves yet, so a cron job starts the sweep every five minutes." },
              { name: "Blueprint env group", call: "generateValue: true", why: "Render generates the shared secret the app uses to trust the workflow." },
              { name: "Persistent disk", call: "disk: mountPath /var/data", why: "Deals and their clocks survive deploys, so no deadline is ever lost." },
            ]}
          />
        </Section>

        <Section eyebrow="Docs & source" title="Read the details.">
          <Docs
            links={[
              { label: "Workflow tasks", href: `${REPO}/blob/main/workflows/src/tasks.ts`, note: "sweepDeals and enforceDeadline, with their retry settings." },
              { label: "Timer engine", href: source("lib/server/timers.ts"), note: "What each deadline does, and how it stays safe to retry." },
              { label: "Deadline rules", href: source("lib/deadlines.ts"), note: "The four timers, as one pure function shared by the server and the UI." },
              { label: "Timer tests", href: repoFile("test/timers.test.ts"), note: "Exactly-once, rescheduling and retry behavior, written down as tests." },
              { label: "render.yaml", href: `${REPO}/blob/main/render.yaml`, note: "The whole system in one Blueprint." },
              { label: "Render Workflows", href: "https://render.com/docs/workflows", note: "Tasks, chained runs and retries." },
              { label: "Workflows SDK for TypeScript", href: "https://render.com/docs/workflows-sdk-typescript", note: "task(), ctx.run() and startTask()." },
              { label: "Cron jobs", href: "https://render.com/docs/cronjobs", note: "The scheduler that starts each sweep." },
              { label: "Blueprint reference", href: "https://render.com/docs/blueprint-spec", note: "Services, disks and environment groups as code." },
            ]}
          />
        </Section>

        <TryIt title={"Start a deal\nthat can't stall."} />
      </main>
      <Footer />
    </>
  );
}
