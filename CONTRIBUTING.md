# Contributing to Handshake

Thanks for helping make deals between strangers safer. This guide covers how to run the project, the rules every change must follow, and how to get a pull request merged. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

1. **AI advises, code moves money.** Models may read, summarize and suggest. Amounts, limits, refunds and captures are always computed in code.
2. **Every money rule has a test.** If your change affects what PayPal is asked to do, add or update a test in `web/test`.
3. **Every money step is idempotent.** Assume any request can be retried or run twice at the same time.
4. **Treat strangers' text as untrusted.** Anything a buyer or seller wrote goes to models through `untrusted()`, never as instructions.
5. **Never commit secrets.** `.env` is git-ignored. Use `.env.example` for new settings.

Found a security issue? Please follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Project layout

```
web/         Next.js app: pages, API routes, PayPal/Channel3/AI clients, tests
workflows/   Render Workflow that enforces deal deadlines, plus its cron trigger
docs/        Architecture and sponsor write-ups
scripts/     Live end-to-end scenarios and PayPal sandbox checks
video/       The demo video, thumbnails and gallery, built in code (Remotion)
render.yaml  Render Blueprint for the whole system
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Getting started

Requires **Node 22+** and free sandbox accounts for PayPal, Channel3 and OpenRouter. The settings you need, and where each comes from, are listed under [Run it locally](README.md#run-it-locally).

```bash
git clone https://github.com/Yashasm18/HandShake.git
cd HandShake
cp .env.example .env               # fill in your sandbox keys
cd web && ln -s ../.env .env.local
npm install
npm run dev                        # http://localhost:3000
```

Locally there's no deadline workflow, so opening a deal enforces any deadline that has passed. Set `TIMER_SCALE=0.0007` in `.env` to make a day pass in about a minute while testing timers.

### Workflow (optional)

```bash
cd workflows
npm install
npm test
```

## Checks before you push

Run these from `web/` (CI runs the same on every pull request):

```bash
npm run lint
npm run typecheck   # generates Next.js route types, then runs tsc
npm test            # the suite on the file store
npm run test:pg     # the same suite on a real Postgres engine (PGlite)
node ../scripts/check-test-counts.mjs app   # the test counts the site quotes still match
npm run build
```

Tests never reach a real service: the setup removes every production setting, and any real database connection or network call throws. Mock what a test needs.

And from `workflows/`:

```bash
npx tsc --noEmit
npm test
```

If your change touches payments, labels, claims or negotiation, also run the live sandbox scenarios in [`scripts/e2e`](scripts/e2e) and update [docs/TESTING.md](docs/TESTING.md) with the result.

## Making a change

1. Create a branch from `main`: `feature/short-name` or `fix/short-name`.
2. Keep changes focused; one idea per pull request.
3. Match the surrounding code: naming, comment density and style. Comments explain *why*, not *what*.
4. Write commit messages in the imperative mood, with a short summary line (for example, `Lock the settlement amount once money is captured`) and details in the body.
5. Open a pull request using the checklist below. `main` is protected: changes land through pull requests with passing CI.

### Pull request checklist

- [ ] Lint, type check, tests and build pass locally
- [ ] Money-moving changes have tests (amounts, limits, retries, double runs)
- [ ] New strangers' text reaches models only through `untrusted()`
- [ ] No secrets, personal data or real payment details in code, tests or screenshots
- [ ] New environment variables are added to `.env.example` and `render.yaml`
- [ ] UI changes checked in light and dark mode, on desktop and phone width

## Adding a deadline

Deadlines are defined once in [`web/src/lib/deadlines.ts`](web/src/lib/deadlines.ts) and enforced in [`web/src/lib/server/timers.ts`](web/src/lib/server/timers.ts). To add one:

1. Add the rule to `RULES` and the condition in `deadlinesFor`.
2. Add its action in `ACTIONS`. Re-check state, keep it idempotent, and throw only on transient failures so the workflow retries.
3. Add its sentence to the countdown in [`deadline.tsx`](web/src/components/deadline.tsx).
4. Cover "not due yet", "due", "already handled" and "runs twice" in [`timers.test.ts`](web/test/timers.test.ts).

## Reporting bugs and ideas

Open an issue with what you expected, what happened, and steps to reproduce. Please use the PayPal sandbox when sharing examples; never include real account or payment details.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
