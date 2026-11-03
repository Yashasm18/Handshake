# Handshake web app

The Next.js app behind [Handshake](../README.md): pages, API routes, and the PayPal, Channel3 and AI clients.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest: money rules, negotiation, timers
npm run lint
npm run build
```

Configuration comes from the repository's [`.env`](../.env.example) (link it here as `.env.local`).

| Path | What's inside |
|---|---|
| `src/app` | Pages and API routes (`/api/deals`, `/api/scan`, `/api/internal/timers`) |
| `src/components` | Deal room, check flow, negotiation UI, landing and partner pages |
| `src/lib/server` | `flows` (deal state machine), `paypal`, `negotiate`, `timers`, `checks`, `channel3`, `ai`, `auth` |
| `src/lib` | Shared, pure logic: `deadlines`, `refund`, `fair`, types |
| `test` | Tests for every rule that moves money |

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full picture and [CONTRIBUTING.md](../CONTRIBUTING.md) before opening a pull request.
