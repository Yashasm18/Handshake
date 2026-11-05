<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img src="docs/assets/logo-light.svg" alt="Handshake logo" width="96" height="96">
</picture>

# Handshake

### Buy from strangers. Keep your money.

AI catches the scam before money moves. PayPal holds the money until the item really arrives.<br>
Agents negotiate a fair price, and every deadline enforces itself.

<br>

[![Live demo](https://img.shields.io/badge/Live_demo-handshake--5rkw.onrender.com-111110?style=for-the-badge)](https://usehandshake.onrender.com)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/Yashasm18/HandShake/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0a7a4b?style=for-the-badge)](LICENSE)

**Powered by**

[![PayPal](https://img.shields.io/badge/PayPal-003087?style=flat-square&logo=paypal&logoColor=white)](docs/sponsors/paypal.md)
[![Channel3](https://img.shields.io/badge/Channel3-111110?style=flat-square)](docs/sponsors/channel3.md)
[![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black)](docs/sponsors/render.md)
[![Kernel](https://img.shields.io/badge/Kernel-111110?style=flat-square)](docs/sponsors/kernel.md)
[![Elastic](https://img.shields.io/badge/Elastic-005571?style=flat-square&logo=elastic&logoColor=white)](docs/sponsors/elastic.md)

**Built with**

[![Claude](https://img.shields.io/badge/Claude-D97757?style=flat-square&logo=anthropic&logoColor=white)](docs/AI.md)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-6566F1?style=flat-square&logo=openrouter&logoColor=white)](docs/AI.md)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-0F172A?style=flat-square&logo=tailwindcss&logoColor=38BDF8)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

<br>

[Live demo](https://usehandshake.onrender.com) · [Watch it work (2 min)](https://usehandshake.onrender.com/#see-how) · [Try it in 60 seconds](#try-it-in-60-seconds) · [How it works](#how-it-works) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md)

</div>

---

## The problem

Americans lost a record **$15.9B to fraud in 2025**, and online shopping scams are the **#2** most reported kind. Buying from a stranger on Marketplace, WhatsApp or Reddit usually ends one of three ways: you pay with *Friends & Family* and get **zero protection**, the item never arrives, or it arrives broken and you fight a 30-day dispute.

**Handshake** is a protected deal room for buying and selling physical goods with people you don't know.

## What it does

| Feature | How |
|---|---|
| **Paste a link** | Paste a Marketplace, Craigslist or OfferUp link. A Kernel cloud browser reads the listing and checks whether its photos are the seller's own or copied from a store. |
| **Scam memory** | Every scam Handshake catches is remembered in Elasticsearch. A new chat with the same tactics, contact details or photo is recognized, even reworded, and buyers can report scams with one click. |
| **Scam check** | Paste the chat or a screenshot. AI flags Friends & Family pressure, fake urgency, overpayment and address swaps, quoting the exact words. |
| **Real-price check** | Live prices from 25,000+ stores. A phone at 64% under retail is flagged as bait. |
| **PayPal hold** | The buyer's money is a PayPal authorization: reserved, never sent, until the item arrives. |
| **Meet in person** | For face-to-face deals: the buyer checks the item, then scans the seller's one-time QR code. PayPal captures and pays the seller on the spot, before the item changes hands. No cash, no fake payment screenshots. |
| **Agent negotiation** | The buyer backs an offer with a hold at a secret max. Two AI agents haggle with real prices, and code keeps both inside their limits. |
| **Label check** | The seller's shipping label is read and matched to the buyer's PayPal-verified address before anything ships. |
| **Fair damage refunds** | A photo of the damage, priced from real replacement parts, settles in minutes with a partial capture. |
| **Self-enforcing deadlines** | No shipment in 3 days? Released. Buyer silent after a verified delivery? Paid. Run by a Render Workflow. |

> **The AI advises. Code moves the money.** Models read, argue and suggest; every amount, limit and refund is computed in code, tested, and paid through PayPal.

## Try it in 60 seconds

Everything runs on the **PayPal sandbox**: no real money moves.

1. Open the **[live demo](https://usehandshake.onrender.com)** and choose **I'm selling**. Paste a listing, for example:
   > *Selling my Nintendo Switch OLED (white), $230. Small scuff on the back, screen perfect, both Joy-Cons, dock and charger included.*
2. Create the deal. Leave **Let my agent take offers** on and set a lowest price (say $190).
3. Copy the deal link and open it in a **private window**. You're now the buyer.
4. Choose **Make an offer**, set a secret max ($215), and click **Back the offer with PayPal's sandbox test card**. Watch the two agents negotiate live.
5. Back in the seller's window, add a tracking number and mark it shipped.
6. In the buyer's window, confirm delivery, or **report a problem** with a photo to see a fair partial refund.

The **PayPal sandbox record** on the deal page shows the real order, authorization, capture and payout ids.

## How it works

```mermaid
flowchart LR
    A["Paste the deal<br/>or a link (Kernel)"] --> B["AI scam check<br/>+ Channel3 prices<br/>+ scam memory (Elastic)"]
    B --> C["PayPal hold<br/>(or backed offer)"]
    C --> D["Agents negotiate"]
    C --> E["Ship to verified address"]
    D --> E
    C --> M["Meet in person:<br/>buyer scans seller's code"]
    M --> G
    E --> F{"Arrived OK?"}
    F -->|yes| G["Capture + payout"]
    F -->|damaged| H["Partial capture<br/>from part prices"]
```

Deadlines run underneath every step, enforced by a [Render Workflow](docs/sponsors/render.md). The full state machine, data flow and design rules are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Built with our partners

Each partner powers a different part of a safe deal. Click through for exactly what we used, how it works inside Handshake, what we liked, and credits.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3><a href="docs/sponsors/paypal.md">PayPal</a></h3>
      <b>Holds, captures, payouts.</b> Seven PayPal REST calls take a deal from a reserved hold to a paid seller, with partial captures for damage, reauthorization for long shipments, and idempotency on every call.<br><br>
      <a href="docs/sponsors/paypal.md"><b>How Handshake uses PayPal →</b></a>
    </td>
    <td width="50%" valign="top">
      <h3><a href="docs/sponsors/channel3.md">Channel3</a></h3>
      <b>Real prices, three jobs.</b> Live product data from 25,000+ stores catches bait prices, sets the agents' fair range, and prices damaged parts for refunds.<br><br>
      <a href="docs/sponsors/channel3.md"><b>How Handshake uses Channel3 →</b></a>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3><a href="docs/sponsors/render.md">Render</a></h3>
      <b>Hosting that keeps promises.</b> An always-on web service, a persistent disk, tests that gate every deploy, and a Render Workflow plus cron that enforce every deal deadline.<br><br>
      <a href="docs/sponsors/render.md"><b>How Handshake uses Render →</b></a>
    </td>
    <td width="50%" valign="top">
      <h3><a href="docs/sponsors/kernel.md">Kernel</a></h3>
      <b>Paste a link, not a screenshot.</b> A stealth cloud browser opens the listing, reads its price and photos, and lets Handshake catch sellers who post store photos instead of the real item.<br><br>
      <a href="docs/sponsors/kernel.md"><b>How Handshake uses Kernel →</b></a>
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <h3><a href="docs/sponsors/elastic.md">Elastic</a></h3>
      <b>A memory for scams.</b> Elasticsearch remembers every scam Handshake catches. Jina embeddings and the Jina reranker match the same tactics in new words, exact search catches reused phone numbers and Cash App tags, and Jina CLIP recognizes reused photos.<br><br>
      <a href="docs/sponsors/elastic.md"><b>How Handshake uses Elastic →</b></a>
    </td>
  </tr>
</table>

The AI layer (Claude, routed through OpenRouter, with every answer checked by Zod) reads chats, labels and photos and runs the negotiating agents. How it's kept in check is in **[docs/AI.md](docs/AI.md)**.

## Safety by design

- **Holds, not payments.** Handshake never holds funds; PayPal does.
- **Code-computed money.** Refunds are capped by verdict and can never exceed what was paid.
- **Idempotent and resumable.** Per-deal locks, PayPal request ids and step-by-step settlement mean retries never charge twice.
- **Real accounts.** Sellers sign in with PayPal on PayPal's own page and are paid into their own account by payer id; buyers see a "Verified PayPal" badge. Sessions are HMAC-signed HttpOnly cookies; Handshake never sees a password.
- **Private by default.** Roles come from HttpOnly cookies or the PayPal account linked to each side; addresses, emails and each side's negotiation limit are only shown to the people allowed to see them.
- **Prompt-injection resistant.** Strangers' text is untrusted evidence; a code referee checks every agent offer and message.

Full threat model and the issues we've found and fixed: **[SECURITY.md](SECURITY.md)**.

## Tests and CI

Handshake is tested two ways: **251 automated tests** that run on every push and deploy, and **37 live end-to-end scenarios** run against the real PayPal sandbox, Channel3, Kernel, Elastic and the AI models with real images and real listings.

| Area | Automated | Live on the sandbox | What it proves |
|---|---:|---:|---|
| Sign in with PayPal | 30 | 2 | Sessions can't be forged, edited or replayed; a sign-in can't be started by another site (state check) or bounce to another site; sellers are paid into their own PayPal by payer id; payer ids and emails never reach the browser; a seller can't pay for their own deal |
| Email updates | 27 | 2 | Each step emails only the person who has to act; nothing goes to an unconfirmed, muted or sandbox address; typed-in addresses must be confirmed from the inbox and can't be used to spam (limits per requester and per real inbox, no stranger-written text before confirming); a buyer whose offer fell through loses access and emails; emails never include the buyer's address; a failing email never undoes a money step |
| Delivery tracking | 25 | | Each carrier status moves the deal correctly: the buyer's window starts at the delivery scan, an automatic payout needs proof it went to the buyer (matching ZIP or verified label), a returned parcel releases the hold, and nothing pays out on silence when a scam sign shows (made-up number, delivery to another ZIP, a reused or recycled number, a lost parcel). EasyPost's webhook only counts with a valid signature; strangers never see the number or places |
| Deal flow and settlement | 14 | 3 | Holds, captures, payouts and voids happen once, for the right amount, only in the right state |
| Meet in person | 13 | 6 | Only the seller can show a handover code and only the buyer can use it; codes expire, work once and lock after 5 wrong tries; the seller never sees the buyer's address |
| Refunds and pricing | 26 | 3 | Refunds come from real part prices, are capped by verdict, and refund plus capture always equals the price |
| Agent negotiation | 20 | 3 | Agents never cross a secret limit, never leak it, and PayPal captures exactly the agreed price |
| Privacy and access | 9 | 3 | Strangers and the wrong party get 403; addresses, PayPal ids and limits stay with the people allowed to see them |
| Label and scam checks | 4 | 5 | A label to the wrong address is stopped, even one that tries to instruct the AI; scam chats and bait prices are flagged |
| Deadlines and the Render Workflow | 30 | 1 | Every deadline fires exactly once, survives retries and concurrent runs, and a hold left unshipped is voided on its own |
| PayPal client | 4 | | Captures and payouts reuse one idempotency key, so a retry can never charge twice |
| Listing links (Kernel) | 20 | 3 | Only public pages are opened, every browser is closed, and listings using store photos are flagged |
| Scam memory (Elastic) | 21 | 6 | Reworded scams, reused details and reused photos are recognized; honest listings aren't; nobody can brand a seller with one fake report |

**Every live scenario passes**, and the run found one real privacy bug that is now fixed and covered by a test. Full results, PayPal sandbox ids and how to re-run them: **[docs/TESTING.md](docs/TESTING.md)**.

- **GitHub Actions** runs lint, type check, tests and a production build on every push and pull request.
- **Render** runs the tests again before every deploy, so a failing rule never reaches the live site.
- **CodeQL** and **Dependabot** watch the code and its dependencies.

```bash
npm --prefix web test
npm --prefix workflows test
```

## Run it locally

Requires **Node 22+** and free keys for the PayPal sandbox, Channel3, OpenRouter, and optionally Kernel (pasted links) and Elastic (scam memory).

```bash
git clone https://github.com/Yashasm18/HandShake.git
cd HandShake
cp .env.example .env          # add your sandbox keys
cd web && ln -s ../.env .env.local
npm install
npm run dev                   # http://localhost:3000
```

To start scam memory with the common scam scripts: `cd web && npx tsx --conditions=react-server scripts/seed-memory.mts`.

Tip: set `TIMER_SCALE=0.0007` in `.env` to make a day pass in about a minute when trying the deadlines.

## Deploy

[`render.yaml`](render.yaml) is a Render Blueprint for the whole system: the web service with its disk, the deadline workflow, the cron job, and a generated shared secret. Connect the repo as a Blueprint, add the secrets it asks for, and add a Render API key to the cron job.

## Project structure

```
web/                 Next.js app: pages, API routes, PayPal, Channel3 and AI clients
  src/lib/server/    flows (state machine), paypal, negotiate, timers, checks
  test/              Vitest suites for every money rule
workflows/           Render Workflow tasks and the cron trigger
video/               The narrated "See how it works" video (Remotion)
docs/                Architecture and partner write-ups
scripts/             One-off PayPal sandbox checks
render.yaml          Render Blueprint
```

## Contributing

Contributions are welcome. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, the ground rules for money-moving code, and the pull request checklist. Security issues go through **[SECURITY.md](SECURITY.md)**.

## License

[MIT](LICENSE) © Yashas M

<div align="center">
<br>
Built for the <a href="https://paypalaihackathon.devpost.com/">PayPal AI Hackathon</a>.
</div>
