import "server-only";

// Who is asking, for rate limits and counting distinct witnesses. Render runs behind Cloudflare, which
// always overwrites CF-Connecting-IP with the address it saw. Without it, use the last X-Forwarded-For
// entry, the one our proxy appended; earlier entries are whatever the client sent.
export function visitorOf(req: Request) {
  const edge = req.headers.get("cf-connecting-ip")?.trim();
  if (edge) return edge;
  const hops = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return hops.at(-1) ?? "local";
}

// A fixed window per visitor, kept in memory. Expired visitors are dropped rather than resetting all.
export function windowLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    take(who: string) {
      const now = Date.now();
      const mine = (hits.get(who) ?? []).filter((t) => now - t < windowMs);
      if (mine.length >= limit) return false;
      hits.set(who, [...mine, now]);
      if (hits.size > 5000) for (const [k, ts] of hits) if (!ts.some((t) => now - t < windowMs)) hits.delete(k);
      return true;
    },
  };
}
