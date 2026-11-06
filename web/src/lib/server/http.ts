import "server-only";
import { ZodError } from "zod";
import { AiUnavailable } from "./ai";
import { HttpError } from "./deals";
import { PayPalError } from "./paypal";
import { recordServerError } from "./status";

export async function handle(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    // Checked before ZodError: a model answering outside the schema is our problem, not the user's input.
    if (e instanceof AiUnavailable) {
      console.error("AI unavailable", (e.cause as Error)?.message?.slice(0, 200));
      return Response.json(
        { error: "Our AI checks are unavailable for a moment. Nothing was charged, shipped or released. Try again in a few minutes.", retryable: true },
        { status: 503, headers: { "Retry-After": "120" } },
      );
    }
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
