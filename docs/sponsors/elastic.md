<div align="center">

# Elastic in Handshake

**Every scam caught protects the next buyer.**

[← Back to README](../../README.md) · [PayPal](paypal.md) · [Channel3](channel3.md) · [Render](render.md) · [Kernel](kernel.md)

</div>

---

## Why Elastic

Scammers don't write a new script for every victim. They reuse the same lines ("send it as Friends & Family", "three other buyers waiting"), the same phone numbers and Cash App tags, and the same photos. A check that only looks at one conversation can't see that.

Handshake uses **Elasticsearch** as a **scam memory**. Every scam it catches, and every scam a buyer reports, is stored as a fingerprint. Every new check is compared against all of them, so the next buyer who meets the same seller is warned, even when the words are different. The Jina models that run inside Elastic do the matching by meaning, both for text and for photos.

## What gets remembered

One document per scam, in the `handshake-scams` index:

| Part | Field | How it's matched |
|---|---|---|
| **Tactics**: the exact red-flag phrases the scan quoted | `semantic_text` with `.jina-embeddings-v5-text-small` | By meaning. Candidates come from the embeddings and **`.jina-reranker-v3`** decides, via a `text_similarity_reranker` retriever |
| **Details**: phones, emails, Cash App tags, accounts and links, found in code | `keyword` | Exactly. `(408) 555-0199` and `408.555.0199` are the same number |
| **Photos** read from a listing by [Kernel](kernel.md) | nested `dense_vector`, 1024 dims, from **`.jina-clip-v2`** | kNN, above 0.92 cosine similarity |
| Flags, sightings, first and last seen, sources, witnesses | `keyword`, `integer`, `date` | Shown to the buyer and counted with ES\|QL |

Product words are left out of the tactics on purpose. An honest listing for the same iPhone never "sounds like" an iPhone scam; only the scam tactics do.

Code: [`memory.ts`](../../web/src/lib/server/memory.ts) (index, searches, rules, reports), [`checks.ts`](../../web/src/lib/server/checks.ts) (where every scan uses it), [`scan/report/route.ts`](../../web/src/app/api/scan/report/route.ts) (reports), [`seed-memory.mts`](../../web/scripts/seed-memory.mts) (the starting set).

## How a check uses it

1. The scan AI copies **only the seller's side** of the chat or listing and quotes the phrases it flags.
2. Three searches run **in parallel with the price check**: exact details (keyword `terms`), tactics (semantic retrieval plus the Jina reranker), and photos (kNN on Jina CLIP vectors).
3. **Code weighs the evidence**:
   - **Known scam:** details or a photo **confirmed** by two different people (or from the seed set). This counts as strong evidence and makes the deal high risk.
   - **Warning:** a single sighting, or similar wording. It shows up but can't make a deal high risk on its own.
4. **High-risk scans are remembered automatically** (their tactics help match future scams; their contact details and photos count only once someone reports them). A buyer can also click **Report this seller as a scam**. The same message seen again bumps its count instead of adding a duplicate (`_update` with upsert).
5. The verdict shows a **Scam memory** panel listing every match, why it matched, how often it was seen, and when.

## Built so it can't be abused

- **Two witnesses to convict.** Pasting an innocent seller's phone number into a fake scam once doesn't brand them. Details and photos only count as a known scam after buyers from two different networks reported them. Contact details and photos only count from records a buyer reported, so an automatic save warns nobody about a person; neighbouring addresses (the same IPv4 /24 or IPv6 /48) count as one; and witnesses are stored only as keyed hashes. Without accounts, someone with many different networks could still fake witnesses, so a match only ever warns: it never blocks anyone or moves money.
- **Reports point at real scans.** A report names a scan Handshake ran in the last 30 minutes, which must have found warning signs, and only the person who ran it can report it. Nobody can submit their own text to memory, and each visitor's report counts once.
- **Only the seller's side.** The buyer's messages, address and identity are never stored. Buyers see only enough of a detail to recognize it, such as "a phone number ending 0199".
- **Memory never blocks a check.** If Elasticsearch is slow or unreachable, the check still runs without it.
- **Limits.** 10 reports per visitor per 10 minutes, and a capped number of stored phrases, details and photos per scam.

## Starting set

Memory starts with **24 common marketplace scam scripts**, written by us from the patterns the FTC and BBB warn about: Friends & Family pressure, fake urgency, overpayment and refund scams, gift-card payments, fake PayPal emails, verification-code theft, shipping-address swaps and more. Their phone numbers use the fictional 555-01xx range, and every handle and tag is invented.

## Live numbers, with ES|QL

The [Elastic page](https://handshake-5rkw.onrender.com/elastic) reads memory with **ES|QL** on every visit: how many scams are remembered, how often they were met, and which tactics are most common.

```
FROM handshake-scams | MV_EXPAND flags | STATS sightings = SUM(seen) BY flags | SORT sightings DESC
```

## Real results from testing

Calibrated on the real Jina models before any thresholds were set:

| Test | Result |
|---|---|
| A reworded Friends & Family scam vs. the stored one | semantic 0.79, **reranker +0.41** |
| Honest listings vs. stored scams | semantic 0.65-0.66, **reranker below 0** |
| The same scam photo, resized / cropped | **0.984 / 0.995** cosine |
| A different photo | 0.64 cosine |

Live end-to-end scenarios against Elastic, all passing (see [docs/TESTING.md](../TESTING.md)):

- A reworded "pls send thru paypal friends n family" scam reads like 2 known scams.
- A known Cash App tag in a brand-new message about a different item is a known scam, at high risk.
- An honest Switch listing matches nothing.
- A buyer reports a scam. The next buyer who meets the same phone number is **warned** (medium risk). After a second person reports it, it becomes a **known scam** (high risk).
- Reports of low-risk checks or unknown scans are refused.
- A stock-photo listing reported once is recognized by its photo when another buyer opens it.

**21 automated tests** cover fingerprints, the matching rules, the two-witness rule, reports and privacy.

## What we liked

- **The Jina models are already in the project.** Embeddings, reranker and CLIP were ready as inference endpoints, with nothing to host or download.
- **Retrievers.** `text_similarity_reranker` turned "find candidates, then rerank" into one request.
- **One index for text, keywords and vectors.** Exact matches, matching by meaning and photo kNN all live in the same document.
- **ES|QL** made the live stats a few lines instead of an aggregation tree.

## Official Elastic resources

- [Elastic docs](https://www.elastic.co/docs)
- [semantic_text](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/semantic-text)
- [Elastic Inference Service](https://www.elastic.co/docs/explore-analyze/elastic-inference/eis)
- [ES|QL](https://www.elastic.co/docs/reference/query-languages/esql)

## Credits

Search and scam memory by **[Elastic](https://www.elastic.co/)**, with Jina models on the Elastic Inference Service. Thank you to the Elastic team for the hackathon trial.
