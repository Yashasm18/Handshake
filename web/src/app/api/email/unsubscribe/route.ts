import { applyEmailLink } from "@/lib/server/contacts";

// One-click unsubscribe (RFC 8058): mail apps POST here from their own "Unsubscribe" button.
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const role = q.get("r");
  if (role !== "seller" && role !== "buyer") return new Response("Bad request", { status: 400 });
  try {
    await applyEmailLink(q.get("d") ?? "", role, q.get("t") ?? "", "mute");
    return new Response("Unsubscribed", { status: 200 });
  } catch {
    return new Response("This link is no longer valid.", { status: 400 });
  }
}

// Opening the link in a browser never changes anything by itself (mail scanners open links too).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const to = new URLSearchParams({ d: q.get("d") ?? "", r: q.get("r") ?? "", t: q.get("t") ?? "", a: "mute" });
  return new Response(null, { status: 303, headers: { Location: `/email?${to}` } });
}
