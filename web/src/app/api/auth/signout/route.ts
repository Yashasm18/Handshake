import { endSession } from "@/lib/server/session";

// POST only: the session cookie is SameSite=Lax, so another site can't sign you out.
export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
