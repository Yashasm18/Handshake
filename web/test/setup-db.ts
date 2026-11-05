// Tests never touch a real database. Render runs the suite during the build with the production
// DATABASE_URL in the environment, so it is removed here before any test can open a connection.
delete process.env.DATABASE_URL;

// With HS_TEST_DB=pglite, every test file runs against a fresh, real Postgres (PGlite) instead of the
// JSON file store, so the whole suite proves the production database path too.
if (process.env.HS_TEST_DB === "pglite") {
  const { pgliteDb } = await import("./pglite");
  const { setDb } = await import("@/lib/server/db");
  setDb(await pgliteDb());
}
export {};
