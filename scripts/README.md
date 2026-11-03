# Sandbox scripts

One-off checks used to prove Handshake's money flow against the PayPal sandbox before the app existed. They read the repository's `.env`.

| Script | What it does |
|---|---|
| `sandbox-test.mjs` | Places a hold with PayPal's published sandbox test card, then exercises partial capture, tracking, payout and void. `node scripts/sandbox-test.mjs` |
| `wallet-authorize.mjs` | After a buyer approves a PayPal wallet order in the browser, places the hold and releases it. `node scripts/wallet-authorize.mjs <ORDER_ID>` |

They only ever talk to `api-m.sandbox.paypal.com`; no real money moves.
