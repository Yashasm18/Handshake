import { connection } from "next/server";
import { Suspense } from "react";
import { Nav } from "@/components/chrome";
import { ApiList, Docs, FeatureHero, Footer, Proof, Section, Steps, TryIt, repoFile, source } from "@/components/feature";
import { FadeIn } from "@/components/motion";
import { memoryStats } from "@/lib/server/memory";

export const metadata = {
  title: "Elastic · Handshake",
  description: "How Handshake uses Elasticsearch and Jina models as a scam memory: every scam it catches makes the next buyer safer.",
};

const label = (flag: string) => flag.replace(/_/g, " ").toLowerCase().replace("friends and family", "Friends & Family").replace(/^\w/, (c) => c.toUpperCase());

// Live numbers, read with ES|QL on every visit.
async function LiveMemory() {
  await connection();
  const stats = await memoryStats().catch(() => null);
  if (!stats) {
    return <p className="text-[17px] text-paper/60">Scam memory is offline right now. Checks still run; they just can&apos;t compare against past scams.</p>;
  }
  const max = Math.max(1, ...stats.byFlag.map((f) => f.sightings));
  return (
    <div className="grid gap-12 md:grid-cols-[0.8fr_1.2fr]">
      <div className="grid grid-cols-2 gap-8">
        <div>
          <p className="display text-[clamp(56px,7vw,104px)]">{stats.fingerprints.toLocaleString()}</p>
          <p className="mt-3 text-[16px] text-paper/60">scams remembered</p>
        </div>
        <div>
          <p className="display text-[clamp(56px,7vw,104px)]">{stats.sightings.toLocaleString()}</p>
          <p className="mt-3 text-[16px] text-paper/60">times they were met</p>
        </div>
      </div>
      <ul className="space-y-4">
        {stats.byFlag.map((f) => (
          <li key={f.flag}>
            <div className="flex items-baseline justify-between gap-4 text-[15px]">
              <span>{label(f.flag)}</span>
              <span className="label text-paper/50">{f.sightings}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-paper/10">
              <div className="h-1.5 rounded-full bg-paper/70" style={{ width: `${(f.sightings / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ElasticPage() {
  return (
    <>
      <Nav />
      <main>
        <FeatureHero
          eyebrow="Elastic · Elasticsearch + Jina models"
          title={"Every scam caught\nprotects the next buyer."}
          lede="Scammers reuse their scripts, phone numbers and photos. Handshake remembers every scam it catches in Elasticsearch, so the next buyer who meets the same seller is warned, even when the words are different."
        />

        <section className="mx-auto grid max-w-[1400px] gap-5 px-5 md:grid-cols-3 md:px-10">
          {[
            { tag: "Same details", h: "Exact matches", p: "Phone numbers, emails, Cash App tags, accounts and links are pulled out in code and matched exactly, in any format: (408) 555-0199 is 408.555.0199.", note: "Elasticsearch keyword terms" },
            { tag: "Same tactics", h: "Matched by meaning", p: "“pls send thru friends n family, 2 more ppl asking” matches “Send as F&F, other buyers waiting”. Jina embeddings find candidates and the Jina reranker decides.", note: "Jina embeddings v5 + reranker v3" },
            { tag: "Same photo", h: "Reused pictures", p: "Listing photos read by Kernel are embedded with Jina CLIP. The same photo resized or cropped still matches at 0.98; a different one scores about 0.64.", note: "Jina CLIP v2 · kNN on dense vectors" },
          ].map((c, i) => (
            <FadeIn key={c.tag} delay={i * 0.1} className="flex flex-col rounded-[28px] border hairline bg-card p-6 md:p-7">
              <p className="label text-muted">{c.tag}</p>
              <h3 className="mt-4 font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em]">{c.h}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-muted">{c.p}</p>
              <p className="label mt-auto pt-8 text-muted">{c.note}</p>
            </FadeIn>
          ))}
        </section>

        <Section
          eyebrow="How it works"
          title={"Remember.\nRecognize. Warn."}
          intro="Memory runs alongside every check: a deal pasted as text, a screenshot, or a link Kernel opened."
        >
          <Steps
            steps={[
              { t: "Read the seller's side", d: "The scan keeps only what the seller wrote, never the buyer's messages or details, plus the exact phrases it flagged as tactics.", tag: "AI · Structured output" },
              { t: "Ask memory three ways", d: "Exact details by keyword, tactics by Jina embeddings and reranker, photos by kNN. The three searches run in parallel with the price check.", tag: "Elasticsearch" },
              { t: "Code weighs the evidence", d: "Details or photos confirmed by two different people are a known scam. A single sighting or similar wording is a warning that can't make a deal high-risk alone.", tag: "Deterministic" },
              { t: "Remember what's caught", d: "High-risk scans are stored automatically, and a buyer can report one with a click. The same message seen again bumps its count instead of duplicating it.", tag: "Upsert" },
              { t: "Count it live", d: "This page reads memory with ES|QL on every visit: how many scams, how often they were met, and which tactics are most common.", tag: "ES|QL" },
            ]}
          />
        </Section>

        <Section dark eyebrow="Live from Elasticsearch" title={"Handshake's memory,\nright now."} intro="Read with ES|QL when this page loads. Seeded with common scam scripts, then growing with every scam Handshake catches.">
          <Suspense fallback={<p className="text-[17px] text-paper/60">Reading memory…</p>}>
            <LiveMemory />
          </Suspense>
        </Section>

        <Section
          eyebrow="Built so it can't be abused"
          title={"Hard to poison.\nPrivate by design."}
        >
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["Two witnesses to convict", "Pasting someone's phone number into a fake scam once doesn't brand them. Details only count as a known scam after buyers on two different networks reported them."],
              ["Reports point at real scans", "A report names a scan Handshake ran in the last 30 minutes, which had to find warning signs, and only the person who ran it can report it. Nobody can submit their own text."],
              ["Only the seller's side", "Memory never stores the buyer's messages, addresses or identity. Visitors are counted by a keyed hash, and buyers see only enough of a detail to recognize it."],
            ].map(([h, p], i) => (
              <FadeIn key={h} delay={i * 0.08} className="border-t hairline pt-6">
                <h3 className="font-display text-[22px] font-semibold tracking-tight">{h}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-muted">{p}</p>
              </FadeIn>
            ))}
          </div>
        </Section>

        <Section eyebrow="Proof" title={"Tested on\nreal searches."}>
          <Proof
            stats={[
              { n: "0.41", t: "reranker score for a reworded Friends & Family scam; honest listings scored below zero.", s: "Jina reranker" },
              { n: "0.98", t: "photo similarity for the same scam photo resized; a different photo scored 0.64.", s: "Jina CLIP" },
              { n: "19", t: "automated tests for fingerprints, matching rules, witnesses, reports and privacy.", s: "Vitest" },
            ]}
          />
        </Section>

        <Section eyebrow="What we call" title="Under the hood.">
          <ApiList
            items={[
              { name: "Fingerprint index", call: "semantic_text · keyword · dense_vector", why: "One document per scam: tactics embedded by Jina, details as keywords, photos as nested 1024-dim vectors." },
              { name: "Same tactics", call: "retriever: text_similarity_reranker", why: "A semantic match finds candidates and .jina-reranker-v3 keeps only real matches." },
              { name: "Same photo", call: "knn on photos.vector", why: "Photo vectors from .jina-clip-v2, matched above 0.92 cosine similarity." },
              { name: "Remember", call: "_update with upsert", why: "The same scam seen again bumps its count, adds new witnesses and keeps one document." },
              { name: "Live stats", call: "POST /_query (ES|QL)", why: "Counts and top tactics for this page, computed in Elasticsearch." },
            ]}
          />
        </Section>

        <Section eyebrow="Docs & source" title="Read the details.">
          <Docs
            links={[
              { label: "Scam memory", href: source("lib/server/memory.ts"), note: "Fingerprints, the three searches, the witness rule and reports." },
              { label: "Memory tests", href: repoFile("test/memory.test.ts"), note: "Matching rules, privacy and poisoning resistance." },
              { label: "Seed scripts", href: repoFile("scripts/seed-memory.mts"), note: "Common scam scripts memory starts with." },
              { label: "Elastic docs", href: "https://www.elastic.co/docs", note: "Elasticsearch, semantic_text, retrievers and ES|QL." },
            ]}
          />
        </Section>

        <TryIt title={"Check a deal\nagainst every scam we've seen."} />
      </main>
      <Footer />
    </>
  );
}
