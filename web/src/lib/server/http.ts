import "server-only";
import { ZodError } from "zod";
import { HttpError } from "./deals";
import { PayPalError } from "./paypal";
import { recordServerError } from "./status";

export async function handle(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return Response.json({ error: "Some details are missing or invalid." }, { status: 400 });
    if (e instanceof PayPalError) {
      console.error("PayPal", e.status, e.issue, e.debugId, e.message);
      return Response.json({ error: `PayPal said: ${e.message}`, issue: e.issue, debugId: e.debugId }, { status: 502 });
    }
    console.error(e);
    recordServerError("an API request");
    return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
