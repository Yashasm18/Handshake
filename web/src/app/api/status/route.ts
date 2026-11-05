import { checkAll, errorsLastHour, overall } from "@/lib/server/status";

// Public health of Handshake's services. Checks are cached per service (5 to 60 minutes), so this can
// be polled without hammering anyone. No keys, hosts or raw errors are ever included.
export async function GET() {
  const checks = await checkAll();
  return Response.json({ overall: overall(checks), checks, errorsLastHour: errorsLastHour(), at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
