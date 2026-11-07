// Captures the demo video's scenes from one real run on the live site: a scam stopped, then an honest
// deal from listing to payout, with real PayPal sandbox calls. Each scene is a sharp full-viewport still
// (1440x810 CSS px at 2x = 2880x1620), plus the box of whatever is about to be clicked, so the video can
// animate the cursor, clicks and zooms smoothly instead of replaying a jittery screen recording.
//
//   node scripts/capture.mjs      -> public/shots/*.png and public/shots/shots.json
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "https://usehandshake.onrender.com";
const OUT = fileURLToPath(new URL("../public/shots/", import.meta.url));
const IMG = fileURLToPath(new URL("../../scripts/e2e/images/", import.meta.url));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const W = 1440, H = 810;
const shots = [];
const facts = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
async function person() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  const page = await ctx.newPage();
  return page;
}

// The box of a locator in viewport CSS px, after bringing it into view.
async function box(loc, block = "center") {
  await loc.first().evaluate((el, b) => el.scrollIntoView({ block: b, behavior: "instant" }), block);
  await sleep(350);
  const b = await loc.first().boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}
// A still of the viewport as it is now. `click` is the box the next action clicks; `focus` a region to zoom to.
async function shot(page, id, extra = {}) {
  await sleep(extra.settle ?? 900);
  await page.screenshot({ path: `${OUT}${id}.png`, animations: "allow" });
  shots.push({ id, ...extra, settle: undefined });
  console.log("shot", id);
}
const scrollTo = (page, loc, block = "start", offset = -110) =>
  loc.first().evaluate((el, [b, o]) => { el.scrollIntoView({ block: b, behavior: "instant" }); window.scrollBy(0, o); }, [block, offset]);

// ---------- 1. A scam, stopped ----------
const scamText = "Hi! Yes the PS5 is still available, $180, brand new sealed. I'm out of town for work so I'll ship it. Please send the money through PayPal Friends and Family so there are no fees, and do it in the next 30 min, I have 2 other people asking. Here's my invoice link: paypal-secure-invoice.co/pay?id=8812";
const buyer1 = await person();
await buyer1.goto(`${BASE}/check`, { waitUntil: "networkidle" });
await sleep(1500);
const box1 = buyer1.getByRole("textbox", { name: "Listing or chat" });
await shot(buyer1, "scam-empty", { click: await box(box1) });
await box1.fill(scamText);
const checkBtn = buyer1.getByRole("button", { name: "Check this deal" });
await shot(buyer1, "scam-typed", { click: await box(checkBtn) });
await checkBtn.click();
await shot(buyer1, "scam-checking", { settle: 1200 });
await buyer1.getByText("Don't send money yet").first().waitFor({ timeout: 60_000 });
await buyer1.evaluate(() => window.scrollTo(0, 0));
await shot(buyer1, "scam-verdict", { settle: 2200 });
await scrollTo(buyer1, buyer1.getByText("What we found", { exact: false }));
await shot(buyer1, "scam-flags", { settle: 1400 });
await scrollTo(buyer1, buyer1.getByText("Phishing link", { exact: false }), "center", 0);
await shot(buyer1, "scam-flags-2", { settle: 900 });
await scrollTo(buyer1, buyer1.getByText("Handshake has seen this before"), "center", 0).catch(() => {});
await shot(buyer1, "scam-memory", { settle: 1200 });

// ---------- 2. An honest deal: the seller lists it ----------
const listing = "Selling my Nintendo Switch OLED (white), $230. Used for 6 months, small scuff on the back, screen perfect. Both Joy-Cons, the dock and the charger included. Can ship or meet in San Jose.";
const seller = await person();
await seller.goto(`${BASE}/check?mode=sell`, { waitUntil: "networkidle" });
await sleep(1500);
const sbox = seller.getByRole("textbox", { name: "Listing or chat" });
await sbox.fill(listing);
const checkMine = seller.getByRole("button", { name: "Check my listing" });
await shot(seller, "sell-typed", { click: await box(checkMine) });
await checkMine.click();
await seller.getByText("Looks like a fair deal").first().waitFor({ timeout: 60_000 });
await seller.evaluate(() => window.scrollTo(0, 0));
await shot(seller, "sell-verdict", { settle: 2200 });
const create = seller.getByRole("button", { name: "Create a protected deal" });
await shot(seller, "sell-verdict-price", { click: await box(create), settle: 900 });
await create.click();
await sleep(1200);
const nameBox = seller.getByLabel(/demo seller/i);
await nameBox.fill("Sam");
const floorInput = seller.locator('input[inputmode="decimal"]').last();
await floorInput.fill("190");
await scrollTo(seller, nameBox, "start", -160);
await shot(seller, "sell-form", { settle: 900 });
const createLink = seller.getByRole("button", { name: /Create deal link/ });
await shot(seller, "sell-form-offers", { click: await box(createLink), settle: 600 });
await createLink.click();
await seller.waitForURL(/\/d\//, { timeout: 30_000 });
const dealUrl = seller.url().replace(/\?.*$/, "");
facts.dealUrl = dealUrl;
await sleep(2500);
await seller.evaluate(() => window.scrollTo(0, 0));
await shot(seller, "deal-share", { click: await box(seller.getByRole("button", { name: "Copy link" })), settle: 1200 });

// ---------- 3. The buyer backs an offer; PayPal holds it; the agents negotiate ----------
const buyer = await person();
await buyer.goto(dealUrl, { waitUntil: "networkidle" });
await sleep(4000);
await buyer.evaluate(() => window.scrollTo(0, 0));
await shot(buyer, "buy-pay", { settle: 1500 });
const payPanel = buyer.getByText("Pay $230 into a PayPal hold");
await scrollTo(buyer, payPanel, "start", -140);
await shot(buyer, "buy-paypal", { settle: 1800 });
const offerTab = buyer.getByRole("tab", { name: "Make an offer" });
await offerTab.click();
await sleep(800);
const max = buyer.getByLabel("Your maximum price");
await max.fill("215");
const backOffer = buyer.getByRole("button", { name: /Back the offer with PayPal's sandbox test card/ });
await shot(buyer, "buy-offer", { click: await box(backOffer), settle: 900 });
await backOffer.click();
// The hold, then the agents' turns, captured as they arrive.
let lastNeg = "";
for (let i = 0; i < 40; i++) {
  await sleep(1500);
  const text = await buyer.locator("main").innerText();
  if (/Agreed at \$\d+/.test(text) || (i > 4 && /is held/i.test(text) && !/negotiat/i.test(text))) break;
  // Keep the live negotiation card in view, and take a frame whenever it changes.
  const live = buyer.getByText(/getting you a better price/i);
  if (await live.count()) {
    await scrollTo(buyer, live, "start", -130).catch(() => {});
    const now = await buyer.locator("main").innerText();
    if (now !== lastNeg) { lastNeg = now; await shot(buyer, `negotiate-${String(i).padStart(2, "0")}`, { settle: 200 }); }
  }
}
await buyer.evaluate(() => window.scrollTo(0, 0));
await shot(buyer, "agreed", { settle: 2000 });
const agreedText = await buyer.locator("main").innerText();
facts.agreed = agreedText.match(/Agreed at \$(\d+)/)?.[1] ?? null;
// The whole negotiation, replayed: both agents' offers on one chart, with what each said.
const replay = buyer.getByRole("button", { name: "Replay the negotiation" });
if (await replay.count()) {
  await replay.first().click();
  await sleep(900);
  await scrollTo(buyer, buyer.getByText("Negotiated by agents"), "start", -120);
  await shot(buyer, "agreed-replay", { settle: 1200 });
}

// ---------- 4. The seller ships: a wrong label is stopped, the right one passes ----------
await seller.reload({ waitUntil: "networkidle" });
await sleep(3000);
await seller.evaluate(() => window.scrollTo(0, 0));
await shot(seller, "ship-held", { settle: 1500 });
const fileInput = seller.locator('input[type="file"]').first();
await fileInput.setInputFiles(`${IMG}label-wrong.png`);
await sleep(1200);
const shipBtn = seller.getByRole("button", { name: /Mark as shipped/ });
await shot(seller, "ship-wrong", { click: await box(shipBtn), settle: 600 });
await shipBtn.click();
await seller.getByText(/isn't the buyer's|Stopped|doesn't match/i).first().waitFor({ timeout: 60_000 }).catch(() => {});
await sleep(1500);
await scrollTo(seller, seller.getByText(/isn't the buyer's|Stopped|doesn't match/i), "center", 0).catch(() => {});
await shot(seller, "ship-blocked", { settle: 1000 });
await seller.reload({ waitUntil: "networkidle" });
await sleep(3000);
await seller.locator('input[type="file"]').first().setInputFiles(`${IMG}label-match.png`);
await sleep(1000);
const delivered = seller.getByRole("button", { name: "Delivered", exact: true });
await delivered.click().catch(() => {});
await sleep(600);
const shipBtn2 = seller.getByRole("button", { name: /Mark as shipped/ });
await shot(seller, "ship-match", { click: await box(shipBtn2), settle: 600 });
await shipBtn2.click();
await seller.getByText(/still held for you/i).first().waitFor({ timeout: 90_000 });
await seller.evaluate(() => window.scrollTo(0, 0));
await shot(seller, "shipped", { settle: 2500 });
await scrollTo(seller, seller.getByText(/Parcel/i).first(), "center", 0).catch(() => {});
await shot(seller, "tracking", { settle: 1200 });

// ---------- 5. The buyer confirms; PayPal captures and pays the seller ----------
await buyer.reload({ waitUntil: "networkidle" });
await sleep(3000);
await buyer.evaluate(() => window.scrollTo(0, 0));
const confirm = buyer.getByRole("button", { name: /Release payment|It arrived|as described/i }).first();
await shot(buyer, "confirm", { click: await box(confirm), settle: 1200 });
await confirm.click();
for (let i = 0; i < 60; i++) {
  await sleep(5000);
  const t = await seller.locator("main").innerText().catch(() => "");
  if (/You've been paid/.test(t)) break;
  await seller.reload({ waitUntil: "networkidle" }).catch(() => {});
}
await seller.evaluate(() => window.scrollTo(0, 0));
await shot(seller, "paid", { settle: 2500 });
const paidText = await seller.locator("main").innerText();
facts.paid = paidText.match(/You've been paid \$([\d.,]+)/)?.[1] ?? null;
await scrollTo(seller, seller.getByText("PayPal sandbox record"), "center", 0).catch(() => {});
await shot(seller, "ledger", { settle: 1200 });
await buyer.reload({ waitUntil: "networkidle" });
await sleep(3000);
await buyer.evaluate(() => window.scrollTo(0, 0));
await shot(buyer, "buyer-done", { settle: 2000 });

// ---------- 6. Underneath: deadlines and live status ----------
const extra = await person();
await extra.goto(`${BASE}/status`, { waitUntil: "networkidle" });
await shot(extra, "status", { settle: 3500 });
await extra.goto(`${BASE}/`, { waitUntil: "networkidle" });
await shot(extra, "home", { settle: 3500 });

writeFileSync(`${OUT}shots.json`, JSON.stringify({ viewport: { w: W, h: H }, facts, shots }, null, 1));
console.log("facts", facts);
await browser.close();
