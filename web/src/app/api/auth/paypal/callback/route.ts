import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { exchangeCode, fetchAccount, LoginError } from "@/lib/server/paypal-login";
import { OAUTH_COOKIE, cookieOptions, sessionSecret, startSession, unseal } from "@/lib/server/session";

type Pending = { state: string; next: string; redirectUri: string };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// PayPal sends the browser back here with a one-time code. The state must match the one this browser
// was given (so no one can sign you into their account), then the code is swapped for your PayPal profile.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const pending = unseal<Pending>(jar.get(OAUTH_COOKIE)?.value, sessionSecret());
  jar.set(OAUTH_COOKIE, "", cookieOptions(0));
  const back = (next: string, outcome: string) => {
    const to = new URL(next, url);
    to.searchParams.set("signin", outcome);
    return new Response(null, { status: 303, headers: { Location: `${to.pathname}${to.search}`, "Cache-Control": "no-store" } });
  };

  const state = url.searchParams.get("state") ?? "";
  if (!pending || !state || !same(state, pending.state)) return back(pending?.next ?? "/deals", "expired");
  if (url.searchParams.get("error")) return back(pending.next, "cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back(pending.next, "cancelled");

  try {
    const account = await fetchAccount(await exchangeCode(code));
    await startSession(account);
    return back(pending.next, "ok");
  } catch (e) {
    console.error("PayPal sign-in", e instanceof LoginError ? e.message : e);
    return back(pending.next, "failed");
  }
}
