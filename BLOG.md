<div align="center">

# Building Handshake

**Safe deals between strangers, built in four days for the PayPal AI Hackathon**

[← Back to README](README.md) · [Read it on the site](https://usehandshake.onrender.com/blog) · [Live demo](https://usehandshake.onrender.com) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md)

</div>

---

## Why I built it

Almost everyone has a version of this story. You find something secondhand at a good price, a console, a bike or a phone, and the seller is a stranger. Then the messages start: *send it Friends & Family, I have other buyers, pay in the next half hour.* You either take the risk, or you walk away from a fair deal.

What struck me is that this isn't a technology gap. PayPal can already hold money without sending it, and AI can already read a chat and spot pressure tactics. Nobody had put them together into the one place where the risk actually happens: the moment two strangers agree a deal.

So the idea for Handshake was simple: **remove the first leap of trust.** Neither side should have to send money or an item on faith.

## The one rule

Before writing any code I set one rule, and it shaped everything after it:

> **The AI advises. Code moves the money.**

AI is very good at reading a messy chat, a blurry shipping label or a photo of a cracked controller. It should never be the thing that decides how much money moves. So in Handshake every model returns structured data checked against a strict schema, and every amount, limit and refund is computed by plain, tested code, then executed by PayPal.

## Day 1: money first

I started with the part that had to be right: the PayPal sandbox money flow. Before any interface existed, a script proved the whole lifecycle worked: create an order with `intent: AUTHORIZE`, capture part of it, attach tracking, pay the seller with Payouts, and void a hold.

One early surprise shaped the design. Capturing a payment directly to the seller didn't work for this flow, so Handshake uses the platform model: the buyer's money is authorized to Handshake's account, and the seller is paid out after capture. It also meant Handshake could take a *partial* capture after damage and let PayPal release the rest automatically.

By the end of the first day there was a working web app on Render: the scam check, PayPal-held deals, AI damage claims, dark mode, and two AI agents negotiating a price for the buyer and the seller. That last one needed the most care. Each agent knows only its own owner's secret limit, and a **code referee** checks every offer and every message, so neither agent can cross its limit or leak it, even if a listing tries to talk it into doing so.

Deals also needed to finish themselves, so deadlines moved into a **Render Workflow**: a seller who never ships has the hold released, a hold that gets old is renewed, and a buyer who goes quiet after a verified delivery can't stall the seller. Settlement became resumable, so a crash halfway through never charges twice.

## Day 2: making it real

Day two was about proving it, then widening it.

I added a **live end-to-end suite** that runs real deals against the PayPal sandbox and the real AI models, with real images: scam screenshots, matching and mismatching shipping labels, a cracked Joy-Con, even a coffee cup sent as "damage". It found a real privacy bug on its first run (a stranger with the link could see PayPal ids in the activity log), and that set the tone: every bug found became a test.

Then three partners went in:

- **Kernel**, so a buyer can paste a listing link instead of a screenshot. A cloud browser opens it and checks whether the photos are the seller's own or copied from a store. Making that safe took most of the work: only public pages, every browser closed, and limits a visitor can't spoof.
- **Elastic**, as a memory for scams. Every scam Handshake catches is remembered, and the next one is recognised by its tactics even in new words, by a reused phone number or Cash App tag, or by a reused photo. The hard part was making sure nobody could use it to brand an innocent seller, so a detail only becomes "known" when two different people report it.
- **Meet in person**, for local deals. The buyer checks the item, then scans the seller's one-time code, and PayPal pays the seller on the spot. No cash, no fake payment screenshots.

## Day 3: from demo to product

Day three turned a demo into something a real person could rely on.

**Sign in with PayPal** came first, so sellers are paid into their own PayPal account. Chrome flagged the first version as a phishing risk: a free-hosting address redirecting straight to a PayPal login looks exactly like a phishing kit. The fix was to let the browser go to PayPal itself from the button. The first payout to a signed-in seller was also refused, because PayPal calls that recipient type `PAYPAL_ID`, not `PAYER_ID`. The capture had already been saved, so the retry paid the seller without charging the buyer again: the resumable design working as intended.

**Payouts** taught the biggest lesson. After many test deals, payouts started failing. PayPal was holding the incoming payments on the new sandbox business account while payouts drew down what was left. Handshake learned to queue a refused payout and retry it with backoff, to tell a seller they're paid only once PayPal confirms the payout completed, and to pay sellers from a separate PayPal app with its own balance.

Then came **emails** (each side hears only what they need to act on), **real delivery tracking** with EasyPost (a payout on silence now needs proof the parcel reached the buyer, and a reused or fake tracking number blocks it), a public **status page** with alert emails, and finally **Render Postgres**, with every deal locked so two servers can never run the same money step at once.

## Day 4: trying to break it

The last day was about trust, and about trying hard to break everything.

It started with an uncomfortable discovery. Render runs the test suite during every build, and the build has the production settings. The tests had quietly written test deals into the production database. They now strip every production setting first, and they **fail closed**: any attempt to reach a real database or a real service from a test throws.

The AI got the same treatment. When the AI credit ran low, the checks needed a backup, and testing free models showed that one of them trains on what it's sent, which isn't acceptable for people's chats and addresses. Now every request asks for providers whose policy is not to keep or train on data, Groq's free tier is the backup, and if every model is down the step stops and says so, with nothing moved.

Then I attacked the live site the way a scammer would: stolen links, forged webhooks, injected scripts, five buyers paying at the same moment, oversized uploads and prompt injection. Most of it held. The pass found nine real problems, and the most important was subtle: the "no red flags" scam check shown on a deal page came from the seller's own browser, so a scammer could have forged a clean one. Scans are now sealed by the server, a seller's own check is never shown to buyers as a badge, and the negotiating agents look up prices themselves. I also walked through it as a first-time judge, which found the most human bug of all: someone testing alone could never see the buyer's side. The page now tells them to open the link in a private window.

## What I learned

- **Build the money path first, and make it boring.** Idempotency keys, saving each step as it happens, and resumable settlement are what let everything else move fast without fear.
- **Every bug becomes a test.** The suite grew to 327 automated tests, and many of them exist because something real went wrong, or nearly did.
- **Test the product as a stranger would.** The scripts proved the money was right; only walking through it as a newcomer found where a person would get stuck.
- **Trust signals are attack surface.** Anything that tells a buyer "this is safe" has to be impossible for a seller to fake.
- **AI is a reader, not a decider.** Giving models narrow jobs with strict schemas made them reliable enough to sit next to real money.

## By the numbers

| What | How many |
|---|---|
| Days | 4 |
| PayPal REST calls | 12, plus PayPal's JS SDK checkout |
| AI jobs | 4: scam check, label check, damage review, negotiation |
| Partners | Channel3, Render, Kernel, Elastic, plus EasyPost, OpenRouter and Groq |
| Automated tests | 327, run twice before every deploy (file store and Postgres) |
| Live end-to-end scenarios | 44 on the PayPal sandbox |
| Attacks on the live site | 43, all holding |

## Where this goes: from a hackathon project to a company

Handshake works end to end today on the PayPal sandbox. Here is how we think about turning it into a business. This is our plan and reasoning, not a promise.

### The opportunity

Secondhand trade between strangers is huge and growing, and almost none of it has a safe way to pay. Marketplaces protect deals that stay inside their own checkout, but people meet in comment threads, group chats and forums, and the moment money changes hands, they're on their own. That gap is where scams live. Handshake's bet is that trust shouldn't belong to one marketplace. It should travel with the deal: a link is all either side needs, wherever they met.

### Who we serve first

**Secondhand electronics and gaming.** It's where the pain is sharpest: items are valuable, easy to ship, easy to fake, and they have real store prices to compare against, which is exactly where Handshake's checks are strongest. We'd start with the communities that already trade this way: buy-and-sell forums, Discord and WhatsApp trading groups, and campus marketplaces.

### How it makes money

- **The scam check stays free.** It's how people find us, and every check makes scam memory smarter for everyone.
- **A small fee on each protected deal.** Paid when the deal settles, and always far less than what a single scam costs. If the deal falls through, nobody pays it.
- **Handshake for platforms.** Communities and smaller marketplaces could add "Protected by Handshake" to their listings, and use scam memory to catch repeat scammers before they post.

### How it grows

Handshake spreads the way a payment link does: every protected deal introduces it to a stranger, the other side of the deal, who has a safe experience and uses it next time. And "is this a scam?" is a question people already ask their friends. A free, clear answer is easy to share.

### Why it's hard to copy

- **Scam memory compounds.** Every scam caught makes the next check sharper. A newcomer starts with an empty memory.
- **Trust that travels.** Over time, a record of completed protected deals becomes a reputation people carry across every platform they trade on.
- **Deep PayPal integration.** Holds, partial captures, renewals, tracking and payouts working together safely took real work, and it's the foundation everything else stands on.

### What has to go right

- **Going live with PayPal:** a production PayPal app, and sellers onboarded through PayPal's platform tools so payments go straight to them.
- **Disputes handled fairly:** a clear path when people disagree, ideally into PayPal's Resolution Center with the evidence already attached.
- **Staying ahead of scammers:** they adapt, so scam memory, human review and appeals have to grow with them.
- **Earning trust slowly:** a safety product only works if people believe it, which means being honest about what it can and can't do.

### The road ahead

| When | What |
|---|---|
| **Now** | Working end to end on the PayPal sandbox: checks, holds, negotiation, tracking, meetups, claims, deadlines |
| **Next** | Live payments with PayPal, sellers paid directly at capture, disputes into PayPal's Resolution Center, and a share-sheet app to check any listing in one tap |
| **Then** | The first trading communities on board, Venmo for buyers, and a reputation from completed deals that travels with you |
| **Later** | Agents that shop for you through PayPal's Agent Toolkit, inside the same limits and holds; PYUSD for cross-border deals; scam memory shared with platforms |

## Thanks

To PayPal for the sandbox and the hackathon, to Channel3, Render, Kernel and Elastic for the tools and credits, and to everyone who has ever lost money to a stranger online. This is for you.

Built by **Yashas M**, with **Claude Code** as a pair programmer.
