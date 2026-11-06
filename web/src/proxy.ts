import { NextResponse, type NextRequest } from "next/server";

// A second line of defence against cross-site requests. Browsers already keep Handshake's cookies off
// requests that start on another site (they're SameSite=Lax); this also refuses, on the server, any
// state-changing API request a browser marks as coming from another site. Server-to-server callers
// (EasyPost's webhook, the timer workflow) send no browser origin, so they pass through.
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// The host an Origin header names; anything unparseable (including "null") counts as another site.
function originHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  if (SAFE.has(req.method)) return NextResponse.next();
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fromElsewhere = site === "cross-site" || (origin !== null && host !== null && originHost(origin) !== host);
  if (fromElsewhere) return NextResponse.json({ error: "Requests from other sites aren't allowed." }, { status: 403 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/((?!webhooks/|internal/).*)"],
};
