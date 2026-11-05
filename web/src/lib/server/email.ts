import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Sends one transactional email. Two providers, picked by configuration:
// - Gmail (GMAIL_USER + GMAIL_APP_PASSWORD): sends to anyone with no domain needed.
// - Resend (RESEND_API_KEY): for a verified domain (until then it only reaches its own account).
// With neither (local dev, tests) the message goes to an in-memory outbox, so every flow still runs.
export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // One-click unsubscribe (RFC 8058), shown by Gmail and Apple Mail next to the sender.
  unsubscribeUrl?: string;
  // Groups a deal's emails into one thread and makes a retried send a no-op at Resend.
  idempotencyKey?: string;
};

export const outbox: Email[] = [];

const gmail = () => (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "") } : null);
export const emailProvider = (): "gmail" | "resend" | null => (gmail() ? "gmail" : process.env.RESEND_API_KEY ? "resend" : null);
export const emailEnabled = () => emailProvider() !== null;
const FROM = () => process.env.EMAIL_FROM || (gmail() ? `Handshake <${gmail()!.user}>` : "Handshake <onboarding@resend.dev>");

let smtp: { key: string; transport: Transporter } | null = null;
function gmailTransport() {
  const g = gmail()!;
  if (smtp?.key !== g.user) smtp = { key: g.user, transport: nodemailer.createTransport({ service: "gmail", auth: { user: g.user, pass: g.pass } }) };
  return smtp.transport;
}

// PayPal sandbox accounts use made-up addresses (…@personal.example.com); mail to them goes nowhere.
const UNDELIVERABLE = /(^|\.)(example\.(com|net|org)|test|invalid|localhost|example)$/i;
const SHAPE = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function validEmail(email: string) {
  return email.length <= 254 && SHAPE.test(email);
}

export function deliverable(email: string | undefined): email is string {
  if (!email || !validEmail(email)) return false;
  return !UNDELIVERABLE.test(email.split("@")[1]);
}

// "j•••@gmail.com": enough for someone to recognize their own address, not enough to harvest it.
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  // Always three dots, so the mask doesn't reveal how long the name is.
  return `${user.slice(0, 1)}•••@${domain}`;
}

export async function sendEmail(email: Email): Promise<{ id?: string; skipped?: string }> {
  if (!deliverable(email.to)) return { skipped: "undeliverable" };
  const provider = emailProvider();
  if (!provider) {
    outbox.push(email);
    if (outbox.length > 200) outbox.shift();
    if (process.env.NODE_ENV !== "test") console.log(`[email] to ${maskEmail(email.to)}: ${email.subject}`);
    return { skipped: "no-provider" };
  }
  const unsubscribe = email.unsubscribeUrl ? { "List-Unsubscribe": `<${email.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  if (provider === "gmail") {
    // Gmail sends as the signed-in account; replies go back to it.
    const info = await gmailTransport().sendMail({ from: FROM(), to: email.to, subject: email.subject, html: email.html, text: email.text, headers: unsubscribe });
    return { id: info.messageId };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: FROM(),
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: unsubscribe,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? "send failed"}`);
  return { id: json.id };
}
