// Records one real Handshake deal on the live site from both sides at once: the buyer and the seller in
// two separate browsers (separate cookies). Frames come from Chrome's screencast with their capture
// times, so both sides share one clock. Each step is marked, so the narration can be laid over it.
//
//   node scripts/record.mjs            (then node scripts/footage.mjs)
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "https://usehandshake.onrender.com";
// A real Craigslist listing; its page is read by Kernel. Listings expire, so it can be overridden.
const LISTING = process.env.LISTING ?? "https://www.craigslist.org/view/d/san-francisco-nintendo-switch-oled/8Qa6TAbBDnKHN1FT6RrApq";
const OUT = fileURLToPath(new URL("../take/", import.meta.url));
rmSync(OUT, { recursive: true, force: true });
const W = 720, H = 900;

// A soft cursor and a click ripple, so viewers can see what's being clicked.
const CURSOR = () => {
  const add = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(17,17,16,.28);border:2px solid rgba(255,255,255,.95);box-shadow:0 1px 6px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;border:2px solid rgba(46,170,110,.9);z-index:2147483646;pointer-events:none;transition:transform .5s ease,opacity .5s ease;transform:scale(.4);opacity:1`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.5)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
};

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--hide-scrollbars"] });
const t0 = Date.now() / 1000;
const marks = [];
const now = () => Date.now() / 1000 - t0;
const mark = (id) => { marks.push({ id, t: now() }); console.log(`${now().toFixed(1)}s  ${id}`); };
const facts = {};

async function side(name) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: "light" });
  await ctx.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const dir = `${OUT}${name}/`;
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  let n = 0;
  cdp.on("Page.screencastFrame", (f) => {
    const file = `${String(n++).padStart(6, "0")}.jpg`;
    writeFileSync(dir + file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp - t0 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  const s = { name, page, cdp, frames };
  await page.mouse.move(W / 2, H * 0.7);
  return s;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function into(locator, block = "center") {
  await locator.first().evaluate((n, b) => n.scrollIntoView({ block: b, behavior: "smooth" }), block);
  await pause(1000);
}
// Glide the cursor to an element, then click it.
async function click(s, locator) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded();
  await into(el);
  const b = await el.boundingBox();
  await s.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 24 });
  await pause(260);
  await s.page.mouse.down(); await pause(90); await s.page.mouse.up();
}
async function type(s, locator, text, delay = 30) {
  await click(s, locator);
  await s.page.keyboard.type(text, { delay });
}

const buyer = await side("buyer");
const seller = await side("seller");
await Promise.all([buyer.page.goto(`${BASE}/`, { waitUntil: "networkidle" }), seller.page.goto(`${BASE}/check?mode=sell`, { waitUntil: "networkidle" })]);
await pause(2500);

mark("list");
await type(seller, seller.page.getByLabel("Listing or chat"), LISTING, 12);
await pause(700);
mark("check");
await click(seller, seller.page.getByRole("button", { name: /Check my listing/ }));
// The verdict headline animates word by word, so match it by its accessible name.
await seller.page.getByRole("heading", { name: /Looks like a fair deal|Proceed carefully|Don't send money/ }).first().waitFor({ timeout: 90000 });
mark("verdict");
await pause(2500);
await into(seller.page.getByText(/Market price/).first());
await pause(2600);
mark("photos");
await into(seller.page.getByText(/Listing photos/).first(), "start");
await pause(2600);
mark("memory");
await into(seller.page.getByText(/Scam memory/).first(), "center");
await pause(2800);

mark("create");
await click(seller, seller.page.getByRole("button", { name: "Create a protected deal" }));
await pause(1200);
const asking = Number(await seller.page.locator("label", { hasText: "Price (USD)" }).locator("input").inputValue());
facts.asking = asking;
facts.floor = Math.round(asking * 0.86);
facts.max = Math.round(asking * 0.93);
await type(seller, seller.page.getByPlaceholder("Sam"), "Sam", 70);
await pause(500);
mark("floor");
await type(seller, seller.page.locator("label", { hasText: "Lowest you" }).locator("input"), String(facts.floor), 120);
await pause(1600);
mark("link");
await click(seller, seller.page.getByRole("button", { name: /Create deal link/ }));
await seller.page.waitForURL(/\/d\/[\w-]+\?as=seller/, { timeout: 30000 });
const dealUrl = seller.page.url().replace("?as=seller", "");
await pause(2600);

mark("open");
await buyer.page.goto(dealUrl, { waitUntil: "networkidle" });
await pause(2600);
mark("offer");
await click(buyer, buyer.page.getByText("Make an offer", { exact: true }));
await pause(900);
const max = buyer.page.locator("label", { hasText: "most you" }).locator("input");
await click(buyer, max);
await buyer.page.keyboard.press("ControlOrMeta+a");
await buyer.page.keyboard.type(String(facts.max), { delay: 130 });
await pause(1800);
mark("hold");
await click(buyer, buyer.page.getByRole("button", { name: /sandbox test card/ }));
await buyer.page.getByText(/Agents negotiating/).first().waitFor({ timeout: 40000 });
mark("negotiate");
await into(buyer.page.getByText(/Agents negotiating/).first(), "start");
await seller.page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
await buyer.page.getByText(/is held\. You haven't been charged/).first().waitFor({ timeout: 180000 });
mark("agreed");
facts.price = Number((await buyer.page.locator("main").last().innerText()).match(/\$(\d+) is held/)?.[1]);
await buyer.page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
await pause(4000);

mark("ship");
await type(seller, seller.page.getByPlaceholder(/Tracking number/), "1Z9W841A0344172958", 40);
await pause(700);
await click(seller, seller.page.getByRole("button", { name: /Mark as shipped/ }));
await seller.page.getByText(/Shipped\./).first().waitFor({ timeout: 30000 });
await seller.page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
await pause(3200);

mark("arrive");
await buyer.page.getByText("Did it arrive as described?").first().waitFor({ timeout: 30000 });
await into(buyer.page.getByText("Did it arrive as described?").first());
await pause(2600);
mark("release");
await click(buyer, buyer.page.getByRole("button", { name: /Yes, release payment/ }));
await buyer.page.getByText(/Done\./).first().waitFor({ timeout: 60000 });
await buyer.page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
await seller.page.getByText(/You've been paid/).first().waitFor({ timeout: 30000 });
await seller.page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
mark("paid");
const sellerText = await seller.page.locator("main").last().innerText();
facts.paid = Number(sellerText.match(/paid \$([\d.]+)/)?.[1]);
facts.fee = Number(sellerText.match(/PayPal fee\s*−\$([\d.]+)/)?.[1]);
await pause(7000);
mark("end");

for (const s of [buyer, seller]) await s.cdp.send("Page.stopScreencast").catch(() => {});
writeFileSync(`${OUT}take.json`, JSON.stringify({ marks, facts, dealUrl, buyer: buyer.frames, seller: seller.frames }, null, 1));
await browser.close();
console.log("facts", JSON.stringify(facts));
