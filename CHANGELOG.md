# Changelog

What changed in Handshake, day by day. Everything runs on the PayPal sandbox; the live demo is at [usehandshake.onrender.com](https://usehandshake.onrender.com). The full detail is in the [commit history](https://github.com/Yashasm18/HandShake/commits/main), and the story behind it in [BLOG.md](BLOG.md).

## 2026-11-07: The demo, checked from a fresh clone

### Added
- A narrated demo video, 2:33, [on YouTube](https://youtu.be/qnwLbxLTqNE), on the landing page and at the top of the README. It's built in code from one real deal on the live site, with an original music bed.

### Changed
- The "Try it in 60 seconds" steps name the exact button to press at every step, checked word for word on the live site and from a fresh clone, through to the seller's PayPal payout.
- "Run it locally" lists the minimum settings and where each one comes from.
- With no AI key set, the server log names the key to add.

## 2026-11-06: Resilience, reminders and the final break-it pass

### Added
- Reminder emails a day before any deadline acts, to the person who has to act.
- A test-mode bar on every page while on the PayPal sandbox; sign-in says it needs a sandbox account.
- Groq's free tier as the AI backup, so checks keep working when paid AI is out of credit.
- A Blog page: the build story, and where Handshake goes as a company.

### Changed
- When every AI provider fails, a clear message says nothing was charged, shipped or released.
- Deal buttons respond instantly and finish faster.
- New tagline: "Trust the deal, not the stranger."

### Security
- A final attack pass on the live site: stolen links, forged webhooks, injected scripts, simultaneous payments and prompt injection. Every issue it found was fixed and recorded in [docs/TESTING.md](docs/TESTING.md).
- Scam checks are sealed by the server, so a seller can't forge a clean one or use it to steer the agents.
- Tests fail closed: a real database connection or network call throws.

## 2026-11-05: Sign in with PayPal, tracking and Postgres

### Added
- Sign in with PayPal: sellers are paid into their own PayPal account, and My deals works on any device.
- Email updates for both sides, through Gmail or Resend.
- Real delivery tracking with EasyPost: live parcel status, payouts only after verified delivery, and reused or rejected tracking numbers flagged.
- A live [status page](https://usehandshake.onrender.com/status) that checks every service with a real request, with alert emails.
- Render Postgres for deals: indexed, locked across servers, imported once from the old file store.

### Changed
- Payouts heal themselves: a refused payout is queued and retried with backoff, one PayPal is still processing is checked every 30 seconds, and the seller is told they're paid only once PayPal confirms it.
- An optional separate PayPal app for payouts, with its own balance.
- AI requests only go to providers that don't keep or train on them.

### Security
- Sign-in return paths refuse anything but a local path; the callback's origin is checked.
- Patched every vulnerable dependency.

## 2026-11-04: Links, scam memory and meetups

### Added
- Paste a listing link: a Kernel cloud browser reads it and catches store photos posing as the real item.
- Scam memory with Elastic: every scam caught protects the next buyer, recognised by its tactics, a reused phone number or a reused photo.
- Meet in person: the buyer checks the item and scans the seller's code, and PayPal pays on the spot.
- 55 more tests and a live end-to-end suite that runs real deals on the PayPal sandbox.
- The README, architecture and partner docs, security policy, contributing guide and CI.

### Security
- Pasted links are checked against their resolved addresses, with spoof-proof per-visitor limits.
- Scam memory resists poisoning: a detail only counts as a known scam after two different people report it.

## 2026-11-03: The first deal, end to end

### Added
- The Handshake web app: a scam check for pasted chats, deals where PayPal holds the money (Orders API, `intent: AUTHORIZE`), and AI-priced damage claims settled by partial capture.
- AI agent negotiation: the buyer backs an offer with a PayPal hold, and code keeps both agents inside their owners' secret limits.
- A Render Workflow that enforces every deal deadline, even if nobody opens the page.
- Pages for the agents, PayPal and Channel3; dark mode.

### Changed
- Settlement is resumable, the settled amount is locked once money is captured, and automatic release needs a verified shipment, each guarded by regression tests.
