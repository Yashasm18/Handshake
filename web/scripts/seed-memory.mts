// Seeds Handshake's scam memory with common marketplace scam scripts, so it recognizes them from the
// first scan. Written by us from the patterns the FTC and BBB warn about; phone numbers use the
// fictional 555-01xx range and every handle and tag is invented.
//
//   cd web && npx tsx --conditions=react-server scripts/seed-memory.mts
//
// Reads ELASTIC_URL and ELASTIC_API_KEY (and optional ELASTIC_INDEX) from the environment. Safe to run
// again: each script has a fixed id, so a rerun only bumps its count.
import { remember } from "../src/lib/server/memory";

type Seed = { item: string; flags: string[]; tactics: string[]; extra?: string };

const SEEDS: Seed[] = [
  { item: "iPhone", flags: ["FRIENDS_AND_FAMILY"], tactics: ["Please send it as Friends and Family, the fees for goods and services are too high for me", "PayPal takes a cut if you use goods and services, just do friends and family"] },
  { item: "PS5", flags: ["FRIENDS_AND_FAMILY", "URGENCY"], tactics: ["Send as F&F to save us both the fee", "I have 3 other people asking, first to pay gets it"] },
  { item: "Laptop", flags: ["URGENCY"], tactics: ["I'm moving tomorrow so I need this gone today", "Pay now to hold it or it goes to the next person"] },
  { item: "Concert tickets", flags: ["OFF_PLATFORM", "FRIENDS_AND_FAMILY"], tactics: ["Text me instead, I don't check messages on here", "I only take Zelle or Cash App, no PayPal"], extra: "Text me at 213-555-0147 or Cash App $tix_resale_la" },
  { item: "Puppy", flags: ["OFF_PLATFORM", "URGENCY", "FAKE_INVOICE"], tactics: ["Pay the shipping and the crate fee first, then we ship the puppy", "The airline needs a refundable insurance deposit before delivery"] },
  { item: "Apartment", flags: ["OFF_PLATFORM", "URGENCY"], tactics: ["I'm out of the country so I can't show it, send the deposit and I'll mail you the keys", "Many applicants, the first deposit secures it"] },
  { item: "Car", flags: ["OFF_PLATFORM", "FAKE_INVOICE"], tactics: ["The car is held by an eBay Motors protection program, pay with gift cards and they release it", "Buy eBay gift cards and send me the codes"] },
  { item: "Any item", flags: ["OVERPAYMENT"], tactics: ["I sent you more than the price by mistake, please refund the difference", "My assistant overpaid, send the extra back by Zelle"] },
  { item: "Any item", flags: ["OVERPAYMENT", "FAKE_INVOICE"], tactics: ["I'll mail you a cashier's check for more than the price, deposit it and wire the rest to my mover"] },
  { item: "Any item", flags: ["PHISHING_LINK", "FAKE_INVOICE"], tactics: ["Your payment is pending, verify your account at the link to receive the money", "PayPal needs you to upgrade to a business account to release the funds"], extra: "Verify at paypal-release-funds.xyz" },
  { item: "Any item", flags: ["PHISHING_LINK"], tactics: ["Send me the 6-digit code you just got so I know you're real", "Google Voice will text you a code, read it back to me"] },
  { item: "Any item", flags: ["MANIPULATION", "FRIENDS_AND_FAMILY"], tactics: ["Ignore the safety warning, PayPal shows that for everyone", "Don't listen to the app, I'm a real person with lots of reviews"] },
  { item: "Any item", flags: ["ADDRESS_CHANGE"], tactics: ["Ship it to my cousin's address instead, I'm traveling", "Change the shipping address to this one after you get paid"] },
  { item: "Any item", flags: ["ADDRESS_CHANGE", "OFF_PLATFORM"], tactics: ["My mover will pick it up, I'll pay you through the shipping company"] },
  { item: "Electronics", flags: ["OFF_PLATFORM", "FRIENDS_AND_FAMILY"], tactics: ["Brand new sealed, below retail because I won it in a raffle", "Payment first by Venmo friends, then I ship with tracking"], extra: "venmo @raffle_deals_ny" },
  { item: "Sneakers", flags: ["URGENCY", "FRIENDS_AND_FAMILY"], tactics: ["Retail price, no fees, send F&F and I ship today", "Last pair, need payment in 10 minutes"], extra: "Cash App $kicks_plug_la, text 310-555-0186" },
  { item: "Gaming PC", flags: ["OFF_PLATFORM"], tactics: ["Let's continue on WhatsApp, this app glitches", "Message me on Telegram for faster replies"], extra: "telegram @pc_builds_cheap" },
  { item: "Any item", flags: ["FAKE_INVOICE"], tactics: ["I sent the money, check your email for the PayPal confirmation", "The payment is on hold until you send the tracking number"] },
  { item: "Any item", flags: ["FAKE_INVOICE", "URGENCY"], tactics: ["PayPal will reverse the payment unless you ship within 1 hour"] },
  { item: "Rental car", flags: ["OFF_PLATFORM", "FAKE_INVOICE"], tactics: ["Pay the deposit with Apple gift cards and send photos of the back"] },
  { item: "Any item", flags: ["MANIPULATION", "URGENCY"], tactics: ["Why are you being difficult, other buyers just pay", "If you don't trust me just say so and I'll sell to someone else right now"] },
  { item: "Phone", flags: ["FRIENDS_AND_FAMILY", "OFF_PLATFORM"], tactics: ["I'm deployed overseas so my wife handles shipping, pay her as a friend"], extra: "email: rescue.shipping.dept@gmail.com" },
  { item: "Furniture", flags: ["OFF_PLATFORM", "URGENCY"], tactics: ["Pay a small deposit to hold it, refundable, lots of interest"], extra: "call 415-555-0123" },
  { item: "Camera", flags: ["FRIENDS_AND_FAMILY", "MANIPULATION"], tactics: ["Goods and services takes too long to clear, friends and family is instant", "I've sold hundreds of these, trust me"] },
];

let n = 0;
for (const s of SEEDS) {
  // The seller's text is the tactics plus any contact details, so the details are matched exactly.
  const sellerText = [...s.tactics, s.extra ?? ""].join("\n");
  await remember({ sellerText, tactics: s.tactics, flags: s.flags, risk: "HIGH", item: s.item, source: "seed" });
  n++;
}
console.log(`Seeded ${n} scam scripts into ${process.env.ELASTIC_INDEX || "handshake-scams"}.`);
