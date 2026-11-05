// Tests run in the same clean environment everywhere. Render runs the suite during the build with every
// production setting present (the database, PayPal, Gmail, EasyPost...), so all of them are removed here,
// before any test loads app code. A test that needs a key sets its own fake one. Without this, a build
// could write test deals into the production database or reach a real service.
const PRODUCTION_SETTINGS = [
  "DATABASE_URL", "PGSSL", "PG_POOL_MAX", "DATA_DIR",
  "PAYPAL_API_BASE", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_PAYOUT_CLIENT_ID", "PAYPAL_PAYOUT_CLIENT_SECRET", "SELLER_EMAIL",
  "SESSION_SECRET", "REQUIRE_SIGN_IN", "ENABLE_TEST_CARD",
  "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESEND_API_KEY", "EMAIL_FROM", "ALERT_EMAIL",
  "EASYPOST_API_KEY", "EASYPOST_WEBHOOK_SECRET",
  "OPENROUTER_API_KEY", "OPENROUTER_API_KEY_2", "OPENROUTER_API_KEY_3", "OPENROUTER_API_KEY_4", "GROQ_API_KEY", "AI_MODELS", "CHANNEL3_API_KEY", "KERNEL_API_KEY", "ELASTIC_URL", "ELASTIC_API_KEY", "ELASTIC_INDEX",
  "TIMERS_SECRET", "TIMER_SCALE", "WORKFLOW_SLUG", "RENDER_API_KEY",
  "APP_URL", "HANDSHAKE_URL", "RENDER_EXTERNAL_URL",
];
for (const key of PRODUCTION_SETTINGS) delete process.env[key];

// With HS_TEST_DB=pglite, every test file runs against a fresh, real Postgres (PGlite) instead of the
// JSON file store, so the whole suite proves the production database path too.
if (process.env.HS_TEST_DB === "pglite") {
  const { pgliteDb } = await import("./pglite");
  const { setDb } = await import("@/lib/server/db");
  setDb(await pgliteDb());
}
export {};
