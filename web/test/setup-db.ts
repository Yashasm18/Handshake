// With HS_TEST_DB=pglite, every test file runs against a fresh, real Postgres (PGlite) instead of the
// JSON file store, so the whole suite proves the production database path too.
if (process.env.HS_TEST_DB === "pglite") {
  const { pgliteDb } = await import("./pglite");
  const { setDb } = await import("@/lib/server/db");
  setDb(await pgliteDb());
}
export {};
