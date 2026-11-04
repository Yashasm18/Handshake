<div align="center">

# Kernel in Handshake

**Paste a link. A real browser reads the listing.**

[← Back to README](../../README.md) · [PayPal](paypal.md) · [Channel3](channel3.md) · [Render](render.md)

</div>

---

## Why Kernel

Buyers find deals on Facebook Marketplace, Craigslist and OfferUp. Asking them to copy a listing's text or take screenshots before every check is friction, and friction is how scams get through.

Those pages are built by JavaScript and turn away simple scripts, so a plain HTTP fetch sees an empty shell. **Kernel** gives Handshake a real Chromium browser in the cloud, with stealth mode for bot detection, that starts in about a second. Handshake opens the pasted link there, reads the listing the way a buyer would, and then checks something buyers rarely notice: **whether the photos are really the seller's**.

## What it does

1. **The buyer pastes a link** on the check page, instead of the listing text.
2. **Kernel opens it** in a stealth browser and reads the title, price, description, page text and the largest photos.
3. **The photos are downloaded inside Kernel's browser**, never by our server.
4. **The usual scam check runs** on what Kernel read: scam phrases, plus [Channel3](channel3.md) prices for the bait check.
5. **The photo check compares** each listing photo with Channel3's store images of the same product. AI says whether it shows the real item in a real place, or a store image or product render. **Code turns any store photo into a flag** with a plain next step: ask for a photo of the item next to today's date.

The verdict shows each listing photo with a **Seller's own photo** or **Store photo** badge.

## What we use

| Call | What it does in Handshake |
|---|---|
| `browsers.create({ stealth: true, timeout_seconds: 60 })` | A fresh, isolated browser per scan, with bot detection handled and a hard time limit |
| `browsers.playwright.execute` | Runs our reader next to the browser: load the page, read its text and images, download up to three photos |
| `browsers.deleteByID` | Deletes the browser in a `finally` block, whether the scan worked or not |

Code: [`kernel.ts`](../../web/src/lib/server/kernel.ts) (link checks, reader, cleanup), [`checks.ts`](../../web/src/lib/server/checks.ts) (photo check and the stock-photo rule), [`scan/route.ts`](../../web/src/app/api/scan/route.ts) (link scans and the per-visitor limit).

## Safety by design

Opening a link a stranger wrote is risky, so the rules are strict:

- **Only public pages.** Code refuses `localhost`, IP addresses (including cloud metadata addresses such as `169.254.169.254`), `.local` and `.internal` names, odd ports, credentials in links, and anything other than `http` and `https`. It also resolves the name and refuses it if any address is private. All of this happens before a browser starts, and again for the page's final address after redirects. Photo links that point at a bare IP or a local name are skipped inside the browser.
- **Nothing untrusted runs on our server.** The page and its photos are fetched inside Kernel's sandbox. Our server only receives text and image data, and accepts only JPEG, PNG, WebP and GIF photos under 1.5 MB.
- **The link is data, not code.** The URL is passed to the browser script as a JSON string literal, so a crafted link can't inject commands. There's a test for exactly that.
- **The page is untrusted evidence.** Its text reaches the AI wrapped as untrusted, like every other stranger's text in Handshake.
- **Limited per visitor and overall.** Each link opens a cloud browser, so one visitor can open 8 links per 10 minutes (identified by Cloudflare's CF-Connecting-IP or the address our proxy appended, which a client can't fake), all visitors together 120, and at most 4 run at once.

## Real results from testing

On November 4, 2026, we scanned 9 live Craigslist listings through Kernel:

| Listing | Photo verdict |
|---|---|
| Nintendo Switch OLED, $220 | Seller's own photo: console, case and box on a beige carpet |
| Switch OLED Zelda edition, $350 | Seller's own photo: box on a wooden deck with visible wear |
| Switch OLED Tears of the Kingdom edition, $330 | Seller's own photo: three boxes on a real tabletop |
| "Brand new" Switch OLED, $295 | Seller's own photo: retail box with uneven lighting |
| iPhone 16 Pro Max, $1,300 | Seller's own photo: sealed box on a patterned rug |
| AirPods Pro 2, $125 | Seller's own photo: sealed box with a glossy reflection |
| AirPods Pro 1 cases, $8 | Seller's own photo: boxes on a wood-grain surface |
| **"New" AirPods Pro 3, $140** | **Store photo: Apple's product render on a seamless white background. Flagged.** |
| iPhone 16 Pro Max 1TB, $1,700 | No photos on the page |

- **A stealth browser starts in 1.3 seconds.** A full scan, from paste to verdict, takes about 20 seconds.
- **The live end-to-end suite** has three Kernel scenarios: a seller's photo passes, a store photo is flagged, and private addresses are refused. See [docs/TESTING.md](../TESTING.md).
- **20 automated tests** cover link safety, DNS checks, browser cleanup on failure, refused redirects, the photo rule and the per-visitor limit.

## What we liked

- **No browser to run ourselves.** `playwright.execute` runs our reader next to the browser, so Handshake ships no Chromium, no Playwright install and no proxy setup.
- **Fast starts.** About a second to a ready browser makes "paste a link" feel like part of the page, not a background job.
- **Stealth mode by default.** Marketplace pages loaded in a stealth browser where a plain fetch would have been blocked.

## Official Kernel resources

- [Kernel docs](https://www.kernel.sh/docs)
- [Quickstart](https://www.kernel.sh/docs/quickstart)
- [Stealth mode](https://www.kernel.sh/docs/browsers/bot-detection/stealth)
- [Kernel dashboard](https://dashboard.onkernel.com)

## Credits

Cloud browsers by **[Kernel](https://www.kernel.sh/)**. Thank you to the Kernel team for the hackathon credits.
