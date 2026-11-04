# Sandbox scripts

One-off checks used to prove Handshake's money flow against the PayPal sandbox before the app existed. They read the repository's `.env`.

| Script | What it does |
|---|---|
| `sandbox-test.mjs` | Places a hold with PayPal's published sandbox test card, then exercises partial capture, tracking, payout and void. `node scripts/sandbox-test.mjs` |
| `wallet-authorize.mjs` | After a buyer approves a PayPal wallet order in the browser, places the hold and releases it. `node scripts/wallet-authorize.mjs <ORDER_ID>` |

They only ever talk to `api-m.sandbox.paypal.com`; no real money moves.

## Live end-to-end scenarios

[`e2e/run.mjs`](e2e/run.mjs) drives a running Handshake server through 18 real scenarios: scam checks on a chat screenshot, full sandbox deals, label photos (including one that tries to talk the AI into a match), damage photos, access control, agent negotiation and a deadline that fires on its own. Results and the latest run are in [docs/TESTING.md](../docs/TESTING.md).

```bash
TIMERS_SECRET=e2e-local-secret TIMER_SCALE=0.0002 npm --prefix web run dev   # in one terminal
node scripts/e2e/run.mjs http://localhost:3000                                # in another
```

The test images are drawn by `e2e/make-images.py`. The damage photo is a real photo and isn't committed; put your own at `e2e/images/damaged-switch.jpg`.
