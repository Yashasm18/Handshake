import "server-only";
import Kernel from "@onkernel/sdk";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./deals";

// A listing as a buyer sees it, read by a real browser in Kernel's cloud. Marketplace pages are built
// by JavaScript and block plain HTTP fetches, so a headful, stealth browser is the reliable way in.
// Everything a stranger controls (the page, its photos) is opened inside Kernel's sandbox, never by
// our server: a listing can't point Handshake at an internal address.
export type ListingPage = {
  url: string;
  host: string;
  title: string;
  description: string;
  text: string;
  photos: { src: string; dataUrl: string }[];
};

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|onion|home|lan)$/i;

// Only public web pages: http(s), a real domain name, default ports, no credentials.
export function listingUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "That doesn't look like a link. Paste the full address, starting with https://");
  }
  const host = url.hostname.replace(/\.$/, "");
  const bad =
    !["https:", "http:"].includes(url.protocol) ||
    url.username || url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    isIP(host.replace(/^\[|\]$/g, "")) !== 0 ||
    !host.includes(".") ||
    BLOCKED_HOST.test(host);
  if (bad) throw new HttpError(400, "Handshake can only open public listing pages, like a Marketplace, Craigslist or eBay link.");
  url.hash = "";
  return url;
}

// True for loopback, private, link-local (incl. cloud metadata), carrier-grade NAT, multicast and reserved ranges.
export function privateAddress(ip: string) {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

// The name must resolve, and only to public addresses. The browser runs in Kernel's cloud, not on our
// network, so this is defense in depth rather than the only barrier.
export async function assertPublicHost(host: string) {
  // A slow nameserver can't hold a request: no answer in 3 seconds counts as no answer.
  const timeout = new Promise<[]>((done) => setTimeout(() => done([]), 3000).unref?.());
  const addrs = await Promise.race([lookup(host, { all: true }).catch(() => [] as []), timeout]);
  if (!addrs.length) throw new HttpError(400, "We couldn't find that website. Check the link and try again.");
  if (addrs.some((a) => privateAddress(a.address))) throw new HttpError(400, "Handshake can only open public listing pages, like a Marketplace, Craigslist or eBay link.");
}

// A message that is only a link (with optional whitespace) is treated as "read this listing".
export const linkOnly = (text?: string) => {
  const t = text?.trim() ?? "";
  return /^https?:\/\/\S+$/i.test(t) ? t : null;
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTO_BYTES = 1_500_000;

// Runs inside the Kernel browser. The URL is embedded as a JSON string literal, never spliced as code.
const readerCode = (url: string) => `
  const target = ${JSON.stringify(url)};
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  const data = await page.evaluate(() => {
    const meta = (n) => document.querySelector('meta[property="' + n + '"],meta[name="' + n + '"]')?.getAttribute("content") || "";
    const big = [...document.images]
      .filter((i) => i.naturalWidth >= 300 && i.naturalHeight >= 300)
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
      .map((i) => i.currentSrc || i.src);
    // Photos come from the listing's own CDNs; never a bare IP or a local name.
    const publicImage = (s) => { try { const h = new URL(s).hostname; return s.startsWith("https://") && h.includes(".") && !/^[\\d.]+$|^\\[|(^|\\.)(localhost|local|internal)$/i.test(h); } catch { return false; } };
    const images = [...new Set([meta("og:image"), ...big])].filter(publicImage).slice(0, 6);
    return {
      url: location.href,
      title: (meta("og:title") || document.title || "").slice(0, 300),
      description: (meta("og:description") || meta("description") || "").slice(0, 1500),
      text: (document.body?.innerText || "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 8000),
      images,
    };
  });
  const photos = [];
  for (const src of data.images) {
    if (photos.length >= 3) break;
    try {
      const res = await page.request.get(src, { timeout: 10000 });
      const type = (res.headers()["content-type"] || "").split(";")[0].trim();
      const body = await res.body();
      if (res.ok() && ${JSON.stringify(PHOTO_TYPES)}.includes(type) && body.length <= ${MAX_PHOTO_BYTES}) {
        photos.push({ src, dataUrl: "data:" + type + ";base64," + body.toString("base64") });
      }
    } catch {}
  }
  return { ...data, photos };
`;

type Raw = { url: string; title: string; description: string; text: string; photos: { src: string; dataUrl: string }[] };

// Every check that needs no browser: the link's shape, that Kernel is set up, and where the name resolves.
export async function checkLink(raw: string) {
  const url = listingUrl(raw);
  if (!process.env.KERNEL_API_KEY) throw new HttpError(503, "Reading links isn't set up on this server. Paste the listing text instead.");
  await assertPublicHost(url.hostname);
  return url;
}

export async function readListing(raw: string): Promise<ListingPage> {
  const url = await checkLink(raw);
  const kernel = new Kernel();
  // Short-lived and always deleted: a scan holds a browser for a few seconds, not the 60s ceiling.
  const browser = await kernel.browsers.create({ stealth: true, timeout_seconds: 60 });
  try {
    const run = await kernel.browsers.playwright.execute(browser.session_id, { code: readerCode(url.href), timeout_sec: 50 });
    if (!run.success || !run.result) throw new Error(run.error ?? "no result");
    const page = run.result as Raw;
    const final = listingUrl(page.url);
    if (final.hostname !== url.hostname) await assertPublicHost(final.hostname);
    return {
      url: final.href,
      host: final.hostname.replace(/^www\./, ""),
      title: String(page.title ?? ""),
      description: String(page.description ?? ""),
      text: String(page.text ?? ""),
      photos: (page.photos ?? []).filter((p) => /^https:\/\//.test(p.src) && /^data:image\/(jpeg|png|webp|gif);base64,/.test(p.dataUrl)),
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error("Kernel", e);
    throw new HttpError(502, "We couldn't open that link. Some listings need a login; paste the listing text or a screenshot instead.");
  } finally {
    await kernel.browsers.deleteByID(browser.session_id).catch(() => {});
  }
}
