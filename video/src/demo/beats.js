// The demo video, beat by beat: under three minutes, one story. A scam is stopped, then an honest deal
// goes from listing to payout, with PayPal holding the money at every step.
//
// vo       what the narrator says (numbers spelled out for the voice)
// caption  the line on screen, in Newsreader like the site
// label    what's working right now, in JetBrains Mono like the site's labels
// shots    stills from scripts/capture.mjs shown across the beat. `zoom` is a region (viewport CSS px)
//          to push into; `click` (from the capture) shows the cursor and a click on the shot's button.
export const beats = [
  {
    id: "hook",
    kind: "hook",
    vo: "You find a used console at a good price. Then the seller writes: pay me Friends and Family, no fees, and hurry. Pay, and you have no protection. Walk away, and you lose a fair deal.",
    caption: "Buying from a stranger means trusting them first.",
    label: "The problem",
  },
  {
    id: "intro",
    vo: "This is Handshake: a safe way to buy and sell with strangers online, on any marketplace or group chat.",
    caption: "A safe way to buy and sell with strangers online",
    label: "Handshake · usehandshake.onrender.com",
    shots: [{ id: "home" }],
  },
  {
    id: "how",
    kind: "steps",
    vo: "It works in three steps. First, AI checks the deal for scams and a fair price. Second, the buyer pays into a PayPal hold, so the money is reserved, not sent. Third, the seller is paid only when the item arrives as described.",
    caption: "Check the deal. Hold the money. Pay on arrival.",
    label: "How Handshake works",
    steps: [
      { at: "First", n: "01", title: "Check", text: "AI reads the chat for scam tricks and checks the price against real stores.", tech: "Claude · Channel3 · Elastic" },
      { at: "Second", n: "02", title: "Hold", text: "The buyer pays into a PayPal hold. The money is reserved, not sent.", tech: "PayPal Orders API" },
      { at: "Third", n: "03", title: "Pay on arrival", text: "The seller is paid only when the item arrives as described. If not, the buyer pays nothing.", tech: "PayPal capture · Payouts" },
    ],
  },
  {
    id: "scam",
    vo: "Here it is, live. Paste the chat. Claude reads it and flags every trick, quoting the exact words: Friends and Family, fake urgency, and a fake PayPal invoice link.",
    caption: "AI flags every scam trick, quoting the exact words",
    label: "AI · Claude via OpenRouter",
    shots: [{ id: "scam-typed", click: true }, { id: "scam-verdict" }, { id: "scam-flags" }],
  },
  {
    id: "price",
    vo: "Channel3 checks the price against real stores. A sealed console at a fraction of the store price is bait. And Elastic remembers every scam Handshake has caught, so this one is recognised.",
    caption: "Real store prices catch bait. Scam memory recognises repeat scams",
    label: "Channel3 · Elastic",
    shots: [{ id: "scam-flags", zoom: { x: 700, y: 40, w: 600, h: 338 } }, { id: "scam-memory", zoom: { x: 200, y: 225, w: 1040, h: 585 } }],
  },
  {
    id: "list",
    vo: "Now an honest deal. Sam pastes his listing: no red flags, and a fair used price. He creates a protected deal, and sets a secret lowest price for his AI agent.",
    caption: "An honest seller creates a protected deal",
    label: "Seller",
    shots: [{ id: "sell-typed", click: true }, { id: "sell-verdict" }, { id: "sell-form" }, { id: "sell-form-offers", click: true }],
  },
  {
    id: "hold",
    vo: "The buyer opens Sam's link. They can pay through PayPal's own checkout, but the money isn't sent. PayPal's Orders API places an authorisation: a hold. Sam can see it's real. Nobody can take it yet.",
    caption: "The buyer's money is held by PayPal, not sent",
    label: "PayPal Orders API · intent: AUTHORIZE",
    shots: [{ id: "buy-pay" }, { id: "buy-paypal", zoom: { x: 0, y: 140, w: 760, h: 430 } }],
  },
  {
    id: "negotiate",
    vo: "Or the buyer backs an offer at a secret maximum, held by PayPal. Two AI agents negotiate from real prices, and code makes sure neither crosses its owner's limit. They agree, and PayPal will only ever capture that price.",
    caption: "Two AI agents agree a fair price inside both secret limits",
    label: "AI agents · agentic commerce",
    shots: [{ id: "buy-offer", click: true }, { id: "negotiate", series: true }, { id: "agreed-replay", zoom: { x: 760, y: 220, w: 620, h: 349 } }],
  },
  {
    id: "ship",
    vo: "Sam ships. The AI reads his shipping label and checks it against the buyer's PayPal-verified address. A label to anywhere else is stopped. The right one passes, and EasyPost follows the parcel to the door.",
    caption: "The label must match the buyer's PayPal address",
    label: "AI label check · EasyPost tracking",
    shots: [{ id: "ship-wrong", click: true }, { id: "ship-blocked" }, { id: "ship-match", click: true }, { id: "shipped" }],
  },
  {
    id: "settle",
    vo: "The buyer confirms it arrived. PayPal captures the payment, attaches the tracking, and pays Sam into his PayPal, after PayPal's fee. Damaged instead? A photo is priced against real parts, and PayPal captures only the fair amount.",
    caption: "PayPal captures, then pays the seller out",
    label: "PayPal capture · tracking · Payouts",
    shots: [{ id: "confirm", click: true }, { id: "paid" }, { id: "ledger" }],
  },
  {
    id: "trust",
    vo: "Every deadline enforces itself with a Render Workflow. If Sam never ships, the hold is released and the buyer pays nothing. The AI advises, and code moves the money, checked by three hundred and fifteen tests and live on the PayPal sandbox.",
    caption: "Deadlines enforce themselves. The AI advises; code moves the money",
    label: "Render Workflows · 315 tests",
    shots: [{ id: "ship-held" }, { id: "tracking", zoom: { x: 760, y: 260, w: 620, h: 349 } }],
  },
  {
    id: "outro",
    kind: "outro",
    vo: "Handshake. Trust the deal, not the stranger.",
    caption: "usehandshake.onrender.com",
    label: "Built for the PayPal AI Hackathon",
  },
];
