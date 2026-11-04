import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { Flag, MemoryMatch, ScamMemory } from "../types";

// Scam memory, stored in Elasticsearch. Every scam Handshake catches (or a buyer reports) is kept as a
// fingerprint of three parts:
// - tactics: the exact red-flag phrases the scan quoted ("send as Friends & Family", "pay in 20
//   minutes"), embedded with Jina for matching by meaning. Product words are left out on purpose, so
//   an honest listing for the same product never "sounds like" a scam;
// - details: emails, phones, Cash App tags, accounts and links in the seller's words, matched exactly;
// - photos: the listing's photos, embedded with Jina CLIP, so a reused scam photo is recognized even
//   resized or cropped.
// Only the seller's side is stored, never the buyer's messages, addresses or identity. A witness is a
// buyer who explicitly reported a scam, kept only as a keyed hash of their network: details and photos
// become "confirmed" once reporters from two different networks have met them (or they come from the
// seed set), so nobody can brand an innocent seller's phone number by pasting it into one fake message.

const TEXT_MODEL = ".jina-embeddings-v5-text-small";
const RERANKER = ".jina-reranker-v3";
const PHOTO_MODEL = ".jina-clip-v2";
const PHOTO_DIMS = 1024;

// Calibrated on real scam scripts: reworded scams scored 0.79-0.89, honest listings 0.65-0.66, and
// the reranker puts true matches above 0.4 and everything else below 0.
const WORDING_RECALL = 0.72;
const WORDING_MATCH = 0.2;
// The same photo resized or cropped scores 0.98+; different photos of similar products about 0.64.
const PHOTO_MATCH = 0.92;

export const memoryIndex = () => process.env.ELASTIC_INDEX || "handshake-scams";
export const memoryEnabled = () => !!(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY);

class ElasticError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function es<T>(method: string, path: string, body?: unknown, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(`${process.env.ELASTIC_URL!.replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `ApiKey ${process.env.ELASTIC_API_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ElasticError(res.status, json.error?.reason ?? json.error?.type ?? `Elasticsearch ${res.status}`);
  return json as T;
}

export const MAPPING = {
  mappings: {
    dynamic: "strict",
    properties: {
      text: { type: "semantic_text", inference_id: TEXT_MODEL },
      indicators: { type: "keyword" },
      flags: { type: "keyword" },
      risk: { type: "keyword" },
      item: { type: "text" },
      host: { type: "keyword" },
      sources: { type: "keyword" },
      witnesses: { type: "keyword" },
      photos: {
        type: "nested",
        properties: { vector: { type: "dense_vector", dims: PHOTO_DIMS, similarity: "cosine", index: true } },
      },
      seen: { type: "integer" },
      firstSeen: { type: "date" },
      lastSeen: { type: "date" },
    },
  },
};

let ready: Promise<void> | null = null;
export function ensureIndex() {
  ready ??= es("HEAD", `/${memoryIndex()}`)
    .catch(async (e) => {
      if (!(e instanceof ElasticError) || e.status !== 404) throw e;
      await es("PUT", `/${memoryIndex()}`, MAPPING).catch((err) => {
        // Another request may have created it first.
        if (!(err instanceof ElasticError && /already.exists/i.test(err.message))) throw err;
      });
    })
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

// ---------- Fingerprints: computed in code, matched exactly ----------

// Sites everyone mentions aren't evidence of anything.
const COMMON_DOMAINS = /(^|\.)(paypal|facebook|fb|craigslist|offerup|ebay|amazon|apple|google|gmail|yahoo|outlook|hotmail|icloud|instagram|whatsapp|reddit|ups|usps|fedex|dhl|onrender|youtube|venmo|cash|zellepay|mercari|poshmark)\.(com|org|net|app|me)$/i;

export function indicatorsOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) out.add(`email:${m[0].toLowerCase()}`);
  // US-style numbers: 10 digits, optional +1, any separators.
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g)) {
    const digits = m[0].replace(/\D/g, "").slice(-10);
    if (digits.length === 10) out.add(`phone:${digits}`);
  }
  // Cash App tags start with a letter, so prices like $230 never count.
  for (const m of text.matchAll(/(?<![\w$])\$([A-Za-z][A-Za-z0-9_]{2,19})\b/g)) out.add(`cashtag:${m[1].toLowerCase()}`);
  for (const m of text.matchAll(/\b(?:venmo|telegram|tg|whatsapp|snap(?:chat)?|ig|insta(?:gram)?)\s*(?:me|is|:|at)?\s*@([A-Za-z0-9_.]{3,30})/gi)) out.add(`handle:${m[1].toLowerCase()}`);
  for (const m of text.matchAll(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:com|net|org|info|xyz|top|shop|site|online|app|io|co|me|link|live|store|click|support))\b/gi)) {
    const host = m[1].toLowerCase().replace(/^www\./, "");
    if (!COMMON_DOMAINS.test(host) && !text.includes(`@${m[1]}`)) out.add(`domain:${host}`);
  }
  return [...out].slice(0, 20);
}

// What the buyer is told: enough to recognize the detail, never the whole thing.
export function describeIndicator(i: string) {
  const kind = i.slice(0, i.indexOf(":"));
  const value = i.slice(i.indexOf(":") + 1);
  if (kind === "phone") return `the same phone number (ending ${value.slice(-4)})`;
  if (kind === "email") return `the same email (${value[0]}•••@${value.split("@")[1]})`;
  if (kind === "cashtag") return `the same Cash App tag ($${value})`;
  if (kind === "handle") return `the same account (@${value})`;
  if (kind === "domain") return `the same website (${value})`;
  return "the same contact details";
}

// Addresses in the same IPv4 /24 or IPv6 /48 count as one witness, so hopping between neighbouring
// addresses doesn't make a second person.
export function networkOf(visitor: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(visitor)) return visitor.split(".").slice(0, 3).join(".") + ".0/24";
  if (visitor.includes(":")) {
    const [head, tail = ""] = visitor.toLowerCase().split("::");
    const groups = head.split(":").filter(Boolean);
    const full = tail ? [...groups, ...Array(8 - groups.length - tail.split(":").length).fill("0"), ...tail.split(":")] : groups;
    return full.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/48";
  }
  return visitor;
}

// A keyed hash of the visitor's network: stable enough to count distinct people, useless for identifying them.
export const witnessOf = (visitor: string) =>
  createHmac("sha256", `${process.env.ELASTIC_API_KEY ?? ""}:witness`).update(networkOf(visitor)).digest("hex").slice(0, 24);

const normalize = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
// Seed scripts and buyers' scans live in separate id spaces: the seeds are public in the repo, so
// resending one word for word must never add to (or inherit the standing of) a seed record.
export const fingerprintId = (text: string, space: "seed" | "user" = "user") =>
  createHash("sha256").update(`${space}:${normalize(text)}`).digest("hex").slice(0, 32);

// ---------- Recall: has Handshake seen this before? ----------

type Hit = { _id: string; _score: number; _source: { flags: string[]; seen: number; lastSeen: string; indicators: string[]; sources: string[]; witnesses?: string[] } };
type Search = { hits: { hits: Hit[]; total: { value: number } } };
const FIELDS = ["flags", "seen", "lastSeen", "indicators", "sources", "witnesses"];
const none: Search = { hits: { hits: [], total: { value: 0 } } };

export async function recall(input: { text: string; photos?: number[][] }): Promise<ScamMemory | null> {
  if (!memoryEnabled() || (!input.text.trim() && !input.photos?.length)) return null;
  await ensureIndex();
  const indicators = indicatorsOf(input.text);
  const idx = memoryIndex();
  const text = input.text.slice(0, 4000);

  const searches: Promise<Search>[] = [
    // 1. Same contact or payment details: exact, and the strongest signal.
    indicators.length ? es<Search>("POST", `/${idx}/_search`, { size: 5, _source: FIELDS, query: { terms: { indicators } } }) : Promise.resolve(none),
    // 2. The same tactics in different words: Jina embeddings find candidates, the Jina reranker decides.
    text.trim()
      ? es<Search>("POST", `/${idx}/_search`, {
          size: 5,
          _source: FIELDS,
          retriever: {
            text_similarity_reranker: {
              retriever: { standard: { query: { match: { text: { query: text } } }, min_score: WORDING_RECALL } },
              field: "text",
              inference_id: RERANKER,
              inference_text: text,
              rank_window_size: 10,
              min_score: WORDING_MATCH,
            },
          },
        })
      : Promise.resolve(none),
    es<Search>("POST", `/${idx}/_search`, { size: 0, track_total_hits: true, query: { match_all: {} } }),
    // 3. The same photo, resized or cropped.
    ...(input.photos ?? []).slice(0, 3).map((vector) =>
      es<Search>("POST", `/${idx}/_search`, {
        size: 3,
        _source: FIELDS,
        knn: { field: "photos.vector", query_vector: vector, k: 3, num_candidates: 30, similarity: PHOTO_MATCH },
      }),
    ),
  ];
  const [byDetails, byWording, total, ...byPhoto] = await Promise.all(searches);

  const matches = new Map<string, MemoryMatch>();
  const add = (h: Hit, kind: MemoryMatch["kinds"][number], detail?: string) => {
    const m = matches.get(h._id) ?? {
      id: h._id,
      kinds: [],
      details: [],
      flags: (h._source.flags ?? []).slice(0, 4),
      seen: h._source.seen ?? 1,
      lastSeen: h._source.lastSeen,
      reported: (h._source.sources ?? []).includes("report"),
      confirmed: (h._source.sources ?? []).includes("seed") || (h._source.witnesses ?? []).length >= 2,
    };
    if (!m.kinds.includes(kind)) m.kinds.push(kind);
    if (detail && !m.details.includes(detail)) m.details.push(detail);
    matches.set(h._id, m);
  };
  // Contact details and photos are about a person, so they only count from records a buyer reported
  // (or the seed set). A high-risk scan saved automatically still helps match tactics, but its
  // details and photos warn nobody until someone reports it.
  const vouched = (h: Hit) => (h._source.sources ?? []).includes("seed") || (h._source.witnesses ?? []).length > 0;
  for (const h of byDetails.hits.hits.filter(vouched)) for (const i of h._source.indicators ?? []) if (indicators.includes(i)) add(h, "SAME_DETAILS", describeIndicator(i));
  // A detail is confirmed once two different people met it, even in different messages: count the
  // distinct witnesses across every stored scam that shares it.
  for (const i of indicators) {
    const sharing = byDetails.hits.hits.filter(vouched).filter((h) => (h._source.indicators ?? []).includes(i));
    const people = new Set(sharing.flatMap((h) => h._source.witnesses ?? []));
    if (people.size >= 2) for (const h of sharing) matches.get(h._id)!.confirmed = true;
  }
  for (const h of byWording.hits.hits) add(h, "SIMILAR_WORDING");
  for (const r of byPhoto) for (const h of r.hits.hits.filter(vouched)) add(h, "SAME_PHOTO");

  const order = { SAME_DETAILS: 0, SAME_PHOTO: 1, SIMILAR_WORDING: 2 } as const;
  const rank = (m: MemoryMatch) => Math.min(...m.kinds.map((k) => order[k]));
  const list = [...matches.values()].sort((a, b) => rank(a) - rank(b) || b.seen - a.seen);
  return { size: total.hits.total.value, matches: list.slice(0, 5) };
}

// Code turns memory matches into flags. Confirmed details and reused photos are strong evidence
// (KNOWN_SCAM). Unconfirmed ones, seen by a single visitor, and similar wording are warning signs
// (SIMILAR_SCAM) that can't make a deal high-risk on their own.
export function memoryFlags(memory: ScamMemory | null): Flag[] {
  if (!memory?.matches.length) return [];
  const flags: Flag[] = [];
  for (const confirmed of [true, false]) {
    const ms = memory.matches.filter((m) => m.confirmed === confirmed);
    const details = [...new Set(ms.flatMap((m) => m.details))];
    if (details.length) {
      flags.push({
        type: confirmed ? "KNOWN_SCAM" : "SIMILAR_SCAM",
        quote: `Uses ${details[0]}${details.length > 1 ? ` and ${details.length - 1} more` : ""}`,
        explanation: confirmed
          ? "Handshake has seen these exact contact or payment details in scams before. Don't pay this seller outside a protected deal."
          : "These contact or payment details appeared in a message Handshake flagged as a scam. Be careful, and keep the payment protected.",
      });
    }
    const photos = ms.filter((m) => m.kinds.includes("SAME_PHOTO")).length;
    if (photos) {
      flags.push({
        type: confirmed ? "KNOWN_SCAM" : "SIMILAR_SCAM",
        quote: `A photo here was used in ${photos === 1 ? "a scam listing" : `${photos} scam listings`} Handshake has seen`,
        explanation: "Scammers reuse the same pictures across fake listings. Ask for a new photo of the item with today's date.",
      });
    }
  }
  const wording = memory.matches.filter((m) => m.kinds.includes("SIMILAR_WORDING"));
  if (wording.length && !flags.length) {
    const seen = wording.reduce((n, m) => n + m.seen, 0);
    flags.push({
      type: "SIMILAR_SCAM",
      quote: `Reads like ${seen === 1 ? "a scam" : `${seen} scams`} Handshake has seen`,
      explanation: "The wording closely matches messages from known scams, even though the exact words differ.",
    });
  }
  return flags;
}

// ---------- Remember: store a fingerprint ----------

export async function embedPhotos(dataUrls: string[]): Promise<number[][]> {
  if (!memoryEnabled() || !dataUrls.length) return [];
  const res = await es<{ embeddings: { embedding: number[] }[] }>(
    "POST",
    `/_inference/embedding/${PHOTO_MODEL}`,
    { input: dataUrls.slice(0, 3).map((value) => ({ content: { type: "image", format: "base64", value } })) },
    20_000,
  );
  return res.embeddings.map((e) => e.embedding).filter((v) => v?.length === PHOTO_DIMS);
}

// `sellerText` is everything the seller wrote (for details and de-duplication); `tactics` are the
// red-flag quotes (for matching by meaning).
export type Fingerprint = { sellerText: string; tactics: string[]; flags: string[]; risk: string; item: string; host?: string; photos?: number[][] };

export async function remember(f: Fingerprint & { source: "scan" | "report" | "seed"; witness?: string }) {
  const tactics = f.tactics.map((t) => t.trim()).filter(Boolean).join("\n").slice(0, 2000);
  const indicators = indicatorsOf(f.sellerText);
  const photos = (f.photos ?? []).slice(0, 3).map((vector) => ({ vector }));
  // Nothing to recognize it by: don't store it.
  if (!memoryEnabled() || (!tactics && !indicators.length && !photos.length)) return null;
  await ensureIndex();
  const now = new Date().toISOString();
  const id = fingerprintId(f.sellerText || tactics, f.source === "seed" ? "seed" : "user");
  const flags = [...new Set(f.flags)].slice(0, 12);
  // Upsert: the same message seen again bumps its count instead of adding a duplicate. A repeat only
  // adds a sighting and a witness; it never attaches new photos or details to an existing record.
  // A high-risk scan saves itself in the background while its buyer may report it a moment later:
  // both upsert the same document, so Elasticsearch retries the loser instead of failing it.
  await es("POST", `/${memoryIndex()}/_update/${id}?refresh=true&retry_on_conflict=5`, {
    upsert: {
      ...(tactics ? { text: tactics } : {}),
      indicators,
      flags,
      risk: f.risk,
      item: f.item.slice(0, 200),
      ...(f.host ? { host: f.host } : {}),
      sources: [f.source],
      witnesses: f.witness ? [f.witness] : [],
      photos,
      seen: 1,
      firstSeen: now,
      lastSeen: now,
    },
    script: {
      source: `ctx._source.seen += 1; ctx._source.lastSeen = params.now;
        if (!ctx._source.sources.contains(params.source)) { ctx._source.sources.add(params.source); }
        if (params.witness != null && !ctx._source.witnesses.contains(params.witness) && ctx._source.witnesses.size() < 50) { ctx._source.witnesses.add(params.witness); }
        for (f in params.flags) { if (!ctx._source.flags.contains(f)) { ctx._source.flags.add(f); } }`,
      params: { now, source: f.source, flags, witness: f.witness ?? null },
    },
  });
  return id;
}

// ---------- Reports: a buyer marks a recent scan as a scam ----------

// Scans are kept here briefly so a report refers to what Handshake itself read, never to text a client
// sends: nobody can report words that weren't in a scan, or a scan that found nothing wrong.
const RECENT_MS = 30 * 60_000;
// One cache per server process, shared by the scan and report routes even if each gets its own copy
// of this module (as happens across route bundles and hot reloads).
type Held = { fp: Fingerprint; at: number; reporters: Set<string> };
const shared = globalThis as typeof globalThis & { __handshakeRecentScans?: Map<string, Held & { owner?: string }> };
const recent = (shared.__handshakeRecentScans ??= new Map<string, Held & { owner?: string }>());

// `owner` is the witness who ran the scan: only they can report it, so a leaked scan id is useless.
export function holdForReport(scanId: string, fp: Fingerprint, owner?: string) {
  const now = Date.now();
  if (recent.size > 1000) for (const [k, v] of recent) if (now - v.at > RECENT_MS) recent.delete(k);
  recent.set(scanId, { fp, at: now, reporters: new Set(), owner });
}

export async function reportScan(scanId: string, witness: string): Promise<"remembered" | "already" | "expired" | "nothing-suspicious" | "nothing-to-keep"> {
  const held = recent.get(scanId);
  if (!held || Date.now() - held.at > RECENT_MS || (held.owner && held.owner !== witness)) return "expired";
  if (held.fp.risk === "LOW") return "nothing-suspicious";
  if (held.reporters.has(witness)) return "already";
  held.reporters.add(witness);
  return (await remember({ ...held.fp, source: "report", witness })) ? "remembered" : "nothing-to-keep";
}

// ---------- Stats with ES|QL, for the Elastic page ----------

export async function memoryStats() {
  if (!memoryEnabled()) return null;
  await ensureIndex();
  const run = (query: string) => es<{ values: unknown[][] }>("POST", "/_query", { query });
  const idx = memoryIndex();
  const [totals, byFlag] = await Promise.all([
    run(`FROM ${idx} | STATS fingerprints = COUNT(*), sightings = SUM(seen)`),
    run(`FROM ${idx} | MV_EXPAND flags | STATS sightings = SUM(seen) BY flags | SORT sightings DESC | LIMIT 6`),
  ]);
  return {
    fingerprints: Number(totals.values[0]?.[0] ?? 0),
    sightings: Number(totals.values[0]?.[1] ?? 0),
    byFlag: byFlag.values.map(([sightings, flag]) => ({ flag: String(flag), sightings: Number(sightings) })),
  };
}
