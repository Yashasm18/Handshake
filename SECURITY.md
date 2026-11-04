# Security Policy

Handshake exists to keep strangers safe when money changes hands, so we treat security bugs as product bugs of the highest priority.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through **GitHub's private vulnerability reporting**: go to the repository's **Security** tab and choose **Report a vulnerability**. Include:

- what you found and where (file, route, or page),
- steps to reproduce, ideally against a local build or the sandbox demo,
- what an attacker could do with it.

We aim to acknowledge reports within **72 hours** and to share a fix plan within **7 days**. We'll credit you in the fix unless you'd rather stay anonymous.

## Scope

| In scope | Out of scope |
|---|---|
| This repository: the web app, API routes, workflow and Blueprint | PayPal, Channel3, Render, Kernel, Elastic, OpenRouter or Anthropic infrastructure (report to them directly) |
| The hosted demo at `handshake-5rkw.onrender.com` | Denial of service, load or spam testing |
| Logic flaws that could move money incorrectly, even in the sandbox | Social engineering, physical attacks |

The demo runs on the **PayPal sandbox**: no real money moves. Please test only with sandbox accounts and PayPal's published test cards, and never with real payment details.

## How Handshake protects people

### Money
- **Holds, not payments.** Buyers' money is a PayPal authorization until the item arrives; Handshake never holds funds itself.
- **Amounts come from code, not AI.** Captures use the agreed price or a code-computed refund that is capped by verdict and can never exceed what was paid.
- **Idempotent PayPal calls.** Every POST carries a `PayPal-Request-Id`; captures use one key per authorization and payouts one per deal.
- **Resumable, locked settlement.** Capture, tracking and payout are recorded step by step under a per-deal lock. A retry finishes a failed payout without capturing twice, and once money is captured no claim or cancellation can change the amount.
- **Automatic release needs proof.** Payment is only released on buyer silence when the seller's label photo matched the buyer's PayPal-verified address.

### Identity and access
- **Roles from HttpOnly cookies.** Buyer and seller are proven by random 256-bit tokens in HttpOnly, `SameSite=Lax` cookies, compared in constant time, never by anything in a request body.
- **Unguessable deals.** Deal ids are 128-bit random values.
- **Checkout pinned to one browser.** A payment can only be completed by the browser that started it, and a checkout window can't be extended to lock others out.
- **Private data stays private.** Shipping addresses, emails, PayPal ids, claim photos and each side's negotiation limit are only sent to the people allowed to see them.
- **Internal timer API.** The deadline workflow authenticates with a secret that Render generates; the route doesn't exist without it.

### Pasted links (Kernel)
- **Public pages only.** Links to `localhost`, IP addresses (including cloud metadata), `.local` and `.internal` names, odd ports, credentials or non-web schemes are refused before a browser starts. The name must also resolve only to public addresses. Both checks run again on the final address after redirects.
- **Untrusted pages never touch our server.** Listings and their photos are opened inside Kernel's cloud browser; the server only receives text and size-limited JPEG, PNG, WebP or GIF data.
- **Links are data, not code.** The URL reaches the browser script as a JSON string literal.
- **Bounded cost.** Each browser has a 60-second ceiling and is always deleted. One visitor can open 8 links per 10 minutes, identified by Cloudflare's CF-Connecting-IP, or else the address our proxy appends, never one a client can supply; all visitors together can open 120, with at most 4 at once.

### Meeting in person
- **The seller is paid before letting go.** The buyer releases the payment with a code only the seller's screen shows, so the seller sees PayPal's confirmation, not a screenshot.
- **Codes are one-time and short-lived.** A 6-digit code and a QR token, valid for 5 minutes, used once, replaced by any newer code, and stored only as hashes.
- **Guessing is capped.** 5 wrong tries lock the code until the seller shows a new one; only the buyer who paid can try at all.
- **No address for in-person deals.** The seller never sees where the buyer lives, and an in-person deal can't be marked as shipped.
- **Captured means final.** If the payout fails after the meetup capture, no deadline or cancellation can touch the money; the next step by either party finishes the payout without capturing again.
- **The token never reaches a log.** The QR link carries it after `#`, which browsers don't send to servers, and the page removes it from the address bar.

### Scam memory (Elastic)
- **Only the seller's side is stored**: the tactics the scan quoted, contact and payment details, and listing photo vectors. Never the buyer's messages, address or identity.
- **Two witnesses to convict.** Details and photos count as a known scam only after buyers from two different networks reported them (or they come from the seed set), so one fake message can't brand an innocent seller. Automatic saves never count as witnesses. Contact details and photos only count from records a buyer reported (or seeds), so an automatic save warns nobody about a person. Addresses in the same IPv4 /24 or IPv6 /48 count as one witness, and witnesses are stored only as keyed hashes.
- **Known limit.** Handshake has no accounts, so someone with many genuinely different networks could still fake witnesses. A confirmed match tells a buyer to keep the payment protected; it never blocks anyone or moves money.
- **Reports point at real scans.** A report names a scan Handshake ran in the last 30 minutes that found warning signs, and only the visitor who ran it can report it; clients can't submit text. One report per visitor per scan, 10 per 10 minutes.
- **Partial details only.** Buyers see "a phone number ending 0199", not the number.
- **Memory never blocks a check**; if Elasticsearch is unreachable, checks run without it.

### AI
- **Untrusted input is labelled.** Listings, chats, complaints and agent messages are wrapped as evidence, never instructions.
- **Strict schemas.** Every model response is validated with Zod; anything outside the schema is dropped.
- **A referee for negotiation.** Offers are clamped to each owner's limit, move in steps, and can only be accepted once the sides are close. Messages that reveal a limit (in digits or words) or quote off-table prices are rejected.
- **Tested against prompt injection** in listings and titles.

### Supply chain and delivery
- **Tests gate deploys.** Render runs the test suite before every build; CI runs it on every push and pull request.
- **CodeQL and Dependabot** scan the code and dependencies.
- **Secrets never live in the repo.** `.env` is git-ignored; production secrets live in Render environment variables.

## Issues we found and fixed

We review every change that touches money or AI. Findings so far, all fixed with regression tests:

| Area | Issue | Fix |
|---|---|---|
| Payments | An outsider holding a public order id could race the buyer's checkout | Checkout bound to the starting browser via an HttpOnly nonce |
| Access | Roles could be claimed from the request body | Roles derived only from HttpOnly cookies |
| Availability | A stranger could lock a deal's checkout indefinitely | Fixed 10-minute window that reopening can't extend |
| Privacy | Addresses leaked through the activity log | Log text never includes private data |
| AI | Seller-written title placed in the agents' trusted facts | All seller text moved into the untrusted block |
| AI | Limit leaks via numbers without `$`, spelled-out amounts, or listing numbers | Every number checked; only Handshake-computed prices count as public |
| Pricing | Damaged-part prices polluted by whole consoles ($304 for a $50 part) | Part filter plus tests built on the real search results |
| Timers | Retried settlement could capture twice; self-reported shipments could auto-release | Resumable settlement; auto-release requires a verified label |
| Timers | A claim could be opened after capture but before payout | Amount locked once captured |
| Privacy | Activity-log entries showed PayPal authorization, capture and payout ids to anyone with the deal link (found by the live end-to-end run) | Log references are only sent to the buyer and seller |
| Links | The link limit trusted the first `X-Forwarded-For` entry, which a client controls, and reset every visitor's count when its table filled | Visitors are identified by Cloudflare's CF-Connecting-IP or the proxy's own entry; expired entries are dropped instead; a global cap and an in-flight limit were added; links are validated before they use any budget |
| Links | A public-looking name that resolved to a private address passed the link check | Names are resolved and refused if any address is private, before and after redirects; photo links to bare IPs are skipped |
| Memory | Matching on whole listings made an honest listing for the same product "sound like" a stored scam | Only the scan's red-flag quotes are matched by meaning; product words are left out |
| Memory | One fake message could have branded an innocent seller's phone number a known scam | Details and photos are confirmed only by two distinct witnesses, counted across messages |
| Memory | Resending a public seed script word for word could attach an innocent person's photo to a confirmed record; automatic saves could warn about a phone number nobody reported | Seeds and buyers' records use separate ids; repeats never add photos or details; details and photos count only from reported records; IPv6 grouped by /48 |
| Meetup | A seller could mark an in-person deal as shipped; a payout failure after the meetup capture could leave a deal captured but unpaid, with a void deadline still running | In-person deals refuse shipping; captured deals have no void deadlines and either party's next step resumes the payout |

## Supported versions

Handshake is deployed continuously from `main`. Only the latest `main` is supported.
