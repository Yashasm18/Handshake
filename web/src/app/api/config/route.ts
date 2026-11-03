import { connection } from "next/server";

// The PayPal client ID is public by design (it ships in the checkout script tag).
export async function GET() {
  await connection();
  return Response.json({ paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "" });
}
