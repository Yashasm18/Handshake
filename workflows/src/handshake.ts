// Talks to the Handshake web app, which owns the deals and the PayPal credentials. The workflow only
// decides *when* to act; the app re-checks every deadline itself before moving any money.

export type Due = { dealId: string; kind: string; at: number };
export type Result = { dealId: string; kind: string; outcome: string; detail: string };

export class RetryableError extends Error {}

const config = () => {
  const base = process.env.HANDSHAKE_URL?.replace(/\/$/, "");
  const secret = process.env.TIMERS_SECRET;
  if (!base || !secret) throw new Error("HANDSHAKE_URL and TIMERS_SECRET must be set.");
  return { base, secret };
};

async function call(method: "GET" | "POST", body?: unknown) {
  const { base, secret } = config();
  let res: Response;
  try {
    res = await fetch(`${base}/api/internal/timers`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new RetryableError(`Handshake unreachable: ${(e as Error).message}`);
  }
  const json = await res.json().catch(() => ({}));
  // 5xx and 429 are worth retrying (PayPal hiccup, deploy in progress); other errors won't fix themselves.
  if (res.status >= 500 || res.status === 429) throw new RetryableError(`Handshake ${res.status}: ${json.error ?? "server error"}`);
  if (!res.ok) throw new Error(`Handshake ${res.status}: ${json.error ?? "request rejected"}`);
  return json;
}

export async function listDue(): Promise<Due[]> {
  return (await call("GET")).due as Due[];
}

export async function enforce(dealId: string, kind: string): Promise<Result> {
  return (await call("POST", { dealId, kind })) as Result;
}
