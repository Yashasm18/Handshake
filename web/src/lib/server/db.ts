import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";

// The Postgres connection. Production uses DATABASE_URL (Render's internal connection string). Tests swap
// in PGlite, a real Postgres engine that runs in-process, through setDb. Without either, the app keeps
// using the JSON file store (local development).
export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  // Runs fn while holding a Postgres advisory lock for `key`, so the same deal is never worked on by
  // two requests at once, even across several servers. The lock frees itself if the server dies.
  lock<T>(key: string, fn: () => Promise<T>): Promise<T>;
};

const g = globalThis as unknown as { __hsDb?: Db | null; __hsPool?: Pool };

export function setDb(db: Db | null) {
  g.__hsDb = db;
}

// The connection holding the current deal's lock. Every query made while that lock is held (reading and
// saving the deal, lookups) runs on this same connection, so a locked step needs exactly one connection
// and a busy server can't deadlock with every connection holding a lock and waiting for another.
// Background work started inside a step (an email, say) may query after the step ends; once the lock is
// released it falls back to the pool, never to a connection already handed back.
const held = new AsyncLocalStorage<{ client: PoolClient; open: boolean }>();

function poolDb(url: string): Db {
  g.__hsPool ??= new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Render's internal URL stays inside Render's private network and needs no TLS. When connecting from
    // outside (PGSSL=true), TLS is required and the server's certificate is verified.
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  const pool = g.__hsPool;
  pool.on("error", (e) => console.error("postgres pool", e.message));
  return {
    query: (sql, params) => {
      const h = held.getStore();
      return (h?.open ? h.client : pool).query(sql, params as unknown[]) as never;
    },
    async lock(key, fn) {
      const client: PoolClient = await pool.connect();
      const h = { client, open: true };
      try {
        await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [key]);
        try {
          return await held.run(h, fn);
        } finally {
          h.open = false;
          await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [key]).catch(() => {});
        }
      } finally {
        client.release();
      }
    },
  };
}

export function getDb(): Db | null {
  if (g.__hsDb !== undefined) return g.__hsDb;
  const url = process.env.DATABASE_URL;
  g.__hsDb = url ? poolDb(url) : null;
  return g.__hsDb;
}

export const usingPostgres = () => getDb() !== null;
