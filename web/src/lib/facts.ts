// Numbers the site states about its own testing. CI checks them against the real test runs
// (scripts/check-test-counts.mjs), so a page can never quote a stale count.
export const TESTS = {
  // App tests. Each one runs twice before every deploy: on the file store and on Postgres (PGlite).
  app: 307,
  // Tests for the Render Workflow that enforces deadlines.
  workflow: 8,
  // Live end-to-end scenarios against the real PayPal sandbox and partner services.
  liveScenarios: 42,
} as const;
export const TOTAL_TESTS = TESTS.app + TESTS.workflow;
