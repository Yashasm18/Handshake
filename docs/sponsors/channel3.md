<div align="center">

# Channel3 in Handshake

**Real prices from 25,000 stores. Not guesses.**

[← Back to README](../../README.md) · [PayPal](paypal.md) · [Render](render.md) · [AI](ai.md)

</div>

---

## Why Channel3

Scammers win when nobody knows what something is worth. A "like new" phone at 64% under retail isn't a bargain; it's bait. And when an item arrives damaged, a fair refund needs to know what the broken part actually costs.

Channel3 gives Handshake live, normalized product data (titles, prices, images and buy links) across **100M+ products from 25,000+ retailers** in one search call. Handshake uses it for three different jobs in a deal.

## What we use

One endpoint, three questions:

| Job | Call | What it decides |
|---|---|---|
| **Scam check** | `POST /v1/search` for the exact item | The retail median. If a listing is **55% or more under it**, Handshake flags it as bait (used goods normally sell 20–50% under retail). |
| **Fair range** | Same search, reused | A fair used price range for the item's condition, computed in code. Both [negotiating agents](ai.md) argue inside it. |
| **Damage pricing** | `POST /v1/search` for the broken part alone | The replacement part's price, which grounds a partial refund. |

Code: [`channel3.ts`](../../web/src/lib/server/channel3.ts) (search and filters), [`checks.ts`](../../web/src/lib/server/checks.ts) (scam check and median), [`fair.ts`](../../web/src/lib/fair.ts) (fair range), [`flows.ts`](../../web/src/lib/server/flows.ts) (damage pricing).

## Clean data in, fair money out

Search results are cleaned in code before any money depends on them:

- **Accessory filter.** Cases, chargers, docks, cables and screen protectors are dropped from an item search, so a $12 case can't drag down an iPhone's price.
- **Part filter.** A part price only counts listings whose title names the part, never anything priced like the whole item, and never accessories (unless the broken part is one).
- **Medians, not averages.** One odd listing can't swing the benchmark.
- **Percentages in code.** The AI never computes "how far under retail"; code does, from the numbers Channel3 returned.

### The bug that made it stronger

During testing, a search for a cracked *"Switch OLED left Joy-Con"* returned whole consoles ($343–$489) next to the part ($26–$45). The median was a console price, and a **$50 part nearly cost a seller $138**.

The part filter now prices that same Joy-Con at **$49.99**, and the exact Channel3 results from the bug are saved as test data in [`test/fixtures.ts`](../../web/test/fixtures.ts). If the filter ever regresses, [`pricing.test.ts`](../../web/test/pricing.test.ts) fails and the deploy stops.

## Real numbers from testing

| Check | Result |
|---|---|
| "iPhone 13, $90" | **63% under** the $242 retail median → flagged as bait |
| Nintendo Switch OLED, used with a scuff | Retail $442 → fair range **$220–$300** |
| Cracked left Joy-Con | Priced at **$49.99** from single Joy-Con listings |

## What we liked

- **One call, clean data.** Normalized titles and prices meant we spent our time on judgment (filters, thresholds, fairness), not on scraping.
- **Images and buy links come with every product**, so the buyer sees real listings behind every number, not a figure we made up.
- **Coverage.** Consoles, phones and the individual parts for them all came back from the same API.

## Official Channel3 resources

- [Channel3 docs](https://docs.trychannel3.com/)
- [Channel3 for developers](https://trychannel3.com/developers)
- [Channel3 MCP server](https://trychannel3.com/mcp)

## Credits

Product and price data by **[Channel3](https://trychannel3.com/)**. Thank you to the Channel3 team for the hackathon credits and support.
