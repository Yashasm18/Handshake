import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@/lib/server/db";

// A real Postgres engine running in-process (PGlite), adapted to Handshake's Db interface, so tests run
// the same SQL production runs. One connection, so locking within a test is Handshake's own per-deal queue.
export async function pgliteDb(): Promise<Db & { pg: PGlite }> {
  const pg = new PGlite();
  await pg.waitReady;
  return {
    pg,
    async query(sql, params = []) {
      // Several statements (the schema) go through exec; single statements with parameters through query.
      if (!params.length && sql.trim().split(";").filter((s) => s.trim()).length > 1) {
        await pg.exec(sql);
        return { rows: [] };
      }
      const r = await pg.query(sql, params as unknown[]);
      return { rows: r.rows as never[] };
    },
    lock: (_key, fn) => fn(),
  };
}
