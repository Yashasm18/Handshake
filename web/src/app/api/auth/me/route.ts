import { loginEnabled } from "@/lib/server/paypal-login";
import { currentAccount, sessionSecret } from "@/lib/server/session";

// Who is signed in, for the nav and the seller form. The payer id stays on the server.
export async function GET() {
  const a = await currentAccount();
  return Response.json(
    { enabled: loginEnabled() && Boolean(sessionSecret()), account: a && { name: a.name, firstName: a.firstName, email: a.email, verified: a.verified } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
