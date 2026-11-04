// The narration, beat by beat. Each beat covers the recorded footage between two marks (see
// scripts/record.mjs), so the voice always describes what's on screen. Numbers are spelled out for
// the voice; the caption carries the short version on screen. `sponsors` light up in the strip.
export const beats = [
  {
    id: "intro",
    kind: "title",
    vo: "This is Handshake: a safe way to buy from a stranger. Here's one real deal, from both sides at once. The buyer is on the left, and the seller is on the right.",
    caption: "One real deal, from both sides",
  },
  {
    id: "list", from: "list", to: "check",
    vo: "Sam wants to sell his Nintendo Switch. He pastes the link to his listing.",
    caption: "The seller pastes his listing link",
    sponsors: [],
  },
  {
    id: "check", from: "check", to: "verdict",
    vo: "A cloud browser from Kernel opens the page, and reads the price and the photos. Then Claude, the AI, checks every word for the tricks that scammers use.",
    caption: "Kernel reads the page. Claude checks it for scams",
    sponsors: ["kernel", "claude"],
  },
  {
    id: "verdict", from: "verdict", to: "photos",
    vo: "No red flags. Channel3 compares the price with real stores, so a fair price looks fair, and a bait price stands out.",
    caption: "Channel3 prices it against real stores",
    sponsors: ["channel3"],
  },
  {
    id: "memory", from: "photos", to: "create",
    vo: "The photos are Sam's own, not copied from a shop. And Elastic checks Handshake's memory of every scam it has seen. No match.",
    caption: "Real photos. No match in Elastic's scam memory",
    sponsors: ["elastic"],
  },
  {
    id: "create", from: "create", to: "link",
    vo: "Sam creates a protected deal, and sets a secret lowest price of one hundred and eighty-nine dollars. Only he, and his AI agent, can see it.",
    caption: "A secret lowest price: $189",
    sponsors: [],
  },
  {
    id: "open", from: "link", to: "offer",
    vo: "He sends the link to the buyer, who opens it on the other side.",
    caption: "The buyer opens the deal link",
    sponsors: [],
  },
  {
    id: "offer", from: "offer", to: "negotiate",
    vo: "The buyer makes an offer, with a secret maximum of two hundred and five dollars. PayPal holds that money, so Sam knows the offer is real. But nothing is charged yet.",
    caption: "A secret max of $205, held by PayPal",
    sponsors: ["paypal"],
  },
  {
    id: "negotiate", from: "negotiate", to: "agreed",
    vo: "Now two AI agents negotiate, live, using real market prices. Each one argues for its owner, and code keeps both of them inside their limits.",
    caption: "Two AI agents negotiate, live",
    sponsors: ["claude", "channel3"],
  },
  {
    id: "agreed", from: "agreed", to: "ship",
    vo: "They agree on one hundred and ninety-five dollars. That's twenty-five less than asking, and it's the only amount that can ever be charged.",
    caption: "Agreed at $195",
    sponsors: ["paypal"],
  },
  {
    id: "ship", from: "ship", to: "arrive",
    vo: "Sam ships to the buyer's PayPal-verified address. From here, every deadline runs on its own, on Render, even if nobody opens the page.",
    caption: "Shipped. Render keeps every deadline",
    sponsors: ["render"],
  },
  {
    id: "release", from: "arrive", to: "paid",
    vo: "The Switch arrives just as described, so the buyer releases the payment.",
    caption: "It arrives as described",
    sponsors: [],
  },
  {
    id: "paid", from: "paid", to: "end",
    vo: "PayPal captures exactly one hundred and ninety-five dollars, and pays Sam one hundred and eighty-nine dollars and forty-six cents, after fees. No cash. No chasing. No scam.",
    caption: "Sam is paid $189.46",
    sponsors: ["paypal"],
  },
  {
    id: "outro",
    kind: "title",
    vo: "Handshake. Buy from strangers, and keep your money. Powered by PayPal, with Channel3, Render, Kernel, and Elastic.",
    caption: "Buy from strangers. Keep your money.",
  },
];
