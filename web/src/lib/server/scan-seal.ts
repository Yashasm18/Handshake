import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./session";

// A scam check is shown to buyers on the deal page ("Scam check: no red flags", the retail median), so
// it must be Handshake's own result. The scan travels through the seller's browser between the check
// and creating the deal, so the server seals it with a keyed signature, and a deal only accepts a scan
// whose seal still matches: a forged or edited scan is refused. A seal lasts a day, enough for a seller
// to sign in with PayPal and come back to their draft.
export const SEAL_MAX_AGE_MS = 24 * 60 * 60_000;

// Without a configured secret (local runs), a per-process one: seals still can't be forged, they just
// don't survive a restart.
const g = globalThis as unknown as { __hsSealKey?: string };
const key = () => sessionSecret() ?? (g.__hsSealKey ??= randomBytes(32).toString("base64url"));

// The same bytes for the same content, whatever order its keys arrive in.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const sign = (content: unknown) => createHmac("sha256", key()).update(`scan-v1.${stable(content)}`).digest("base64url");

export function sealScan<T extends object>(scan: T, now = Date.now()): T & { sealedAt: string; seal: string } {
  const sealed = { ...scan, sealedAt: new Date(now).toISOString() };
  return { ...sealed, seal: sign(sealed) };
}

// True only for a scan this server sealed, unchanged since, and sealed within the last day.
export function verifyScan(raw: unknown, now = Date.now()): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const { seal, ...content } = raw as Record<string, unknown>;
  if (typeof seal !== "string" || typeof content.sealedAt !== "string") return false;
  const age = now - Date.parse(content.sealedAt);
  if (!(age >= -60_000 && age <= SEAL_MAX_AGE_MS)) return false;
  const want = Buffer.from(sign(content));
  const got = Buffer.from(seal);
  return want.length === got.length && timingSafeEqual(want, got);
}
