# Handshake

**Safe deals between strangers, powered by PayPal and AI.**

AI catches the scam before money moves. PayPal holds the money until the item is real. If it arrives damaged, the AI settles it in minutes with a fair partial refund based on real market prices.

> Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Work in progress.

## How it works
1. **Create a deal:** paste a listing or screenshot, and Gemini extracts the item, price and condition.
2. **Scam check:** Channel3 gives real market prices, and code computes how far below market the listing is. Gemini flags Friends & Family pressure, urgency and address tricks.
3. **Buyer funds a PayPal hold:** Orders v2 with `intent=AUTHORIZE`. The money is reserved, not captured.
4. **Seller ships** to the PayPal-verified address.
5. **Delivery:** the buyer confirms, or the hold auto-captures after an inspection window.
6. **Damage?** The AI compares photos, Channel3 prices the part, and code proposes a **partial capture**. The rest is released automatically.
7. **Settle:** tracking is attached to the capture, and the seller is paid through **PayPal Payouts**.

The AI only recommends. Deterministic code moves money, and only after both people accept.

## PayPal APIs used (sandbox-verified)
- Orders v2 (`AUTHORIZE`), Payments v2 authorizations: capture, partial capture with `final_capture`, void
- Orders v2 `/track` (shipment tracking after capture)
- Payouts v1 (seller disbursement)
- Per-call `PayPal-Request-Id` idempotency

## Run it locally
Requires Node 22+.
```bash
cp .env.example .env          # fill in your PayPal sandbox, Channel3 and OpenRouter keys
cd web && ln -s ../.env .env.local
npm install
npm run dev                   # http://localhost:3000
```

On a deal page, buyers can pay with a real PayPal sandbox login, or use **"Skip login and pay with PayPal's sandbox test card"** to test the full flow in seconds.

## Deploy
`render.yaml` is a Render Blueprint: one Node service runs the Next.js frontend and its API routes. Set the secret env vars in the Render dashboard.

## Stack
- **Next.js 16** (App Router, route handlers) with TypeScript, Tailwind CSS 4, Motion and Lenis
- **PayPal** Orders v2, Payments v2, Payouts v1 (sandbox)
- **Channel3** product search for market and replacement-part prices
- **OpenRouter**: Claude Haiku 5.5, with GPT-6 Luna as automatic fallback, for vision and structured output (validated with Zod)

## Sandbox checks
```bash
node scripts/sandbox-test.mjs
```

## License
MIT
