export type Flag = {
  type:
    | "FRIENDS_AND_FAMILY"
    | "URGENCY"
    | "OFF_PLATFORM"
    | "OVERPAYMENT"
    | "ADDRESS_CHANGE"
    | "PHISHING_LINK"
    | "FAKE_INVOICE"
    | "MANIPULATION"
    | "PRICE_TOO_LOW";
  quote: string;
  explanation: string;
};

export type Market = {
  query: string;
  medianCents: number;
  lowCents: number;
  highCents: number;
  comps: { title: string; priceCents: number; image?: string; url?: string; merchant?: string }[];
  // Positive = listing is below market by this percentage (computed in code, never by the model).
  belowMarketPct: number | null;
};

export type Scan = {
  item: string;
  priceCents: number | null;
  condition: string;
  checklist: string[];
  flags: Flag[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  market: Market | null;
};

export type DealStatus =
  | "AWAITING_PAYMENT"
  // A buyer's offer is backed by a PayPal hold at their max while the two agents negotiate.
  | "NEGOTIATING"
  | "HELD"
  | "SHIPPED"
  | "CLAIM_OPEN"
  | "SETTLED"
  | "RELEASED";

export type Claim = {
  photo?: string;
  note: string;
  finding: string;
  damagedPart: string;
  verdict: "MATCHES_LISTING" | "MINOR_ISSUE" | "NOT_AS_DESCRIBED";
  partQuery: string | null;
  partPriceCents: number | null;
  partComp?: { title: string; url?: string; merchant?: string };
  refundCents: number;
  captureCents: number;
  buyerAccepted: boolean;
  sellerAccepted: boolean;
  // A decline stops the automatic settlement; the case goes to PayPal Resolution Center instead.
  declinedBy?: "buyer" | "seller";
};

export type Turn = {
  by: "buyer" | "seller";
  offerCents: number;
  message: string;
  at: string;
  // Set when code had to pull the agent's number back inside its owner's limits.
  clamped?: boolean;
};

export type Negotiation = {
  status: "RUNNING" | "AGREED" | "NO_DEAL";
  askingCents: number;
  // Buyer-only secret: the hold amount and the most their agent may offer.
  maxCents?: number;
  // Fair price band for this item in this condition, computed in code from retail comps.
  fair: { lowCents: number; highCents: number } | null;
  turns: Turn[];
  agreedCents?: number;
  // How the deal closed: an agent accepted, offers crossed, or code split the remaining gap.
  closedBy?: "buyer" | "seller" | "referee";
  startedAt: string;
};

export type Deal = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  priceCents: number;
  condition: string;
  checklist: string[];
  photo?: string;
  sellerName: string;
  sellerEmail: string;
  scan: Scan | null;
  status: DealStatus;
  demo: boolean;
  // Seller-only secret: the lowest price their agent may accept. Set means the deal takes offers.
  floorCents?: number;
  // Server-only: the max a buyer chose for a backed offer, between starting checkout and the hold.
  pendingOfferCents?: number;
  negotiation?: Negotiation;
  // When each stage started; deadlines (see lib/deadlines.ts) are measured from these.
  clock?: {
    heldAt?: string;
    authorizedAt?: string;
    reauthorizedAt?: string;
    // Set when PayPal says it's too soon to reauthorize, so the timer tries again later.
    reauthorizeAfter?: string;
    shippedAt?: string;
    claimAt?: string;
  };
  paypal: {
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    capturedCents?: number;
    feeCents?: number;
    netCents?: number;
    payoutBatchId?: string;
    payoutCents?: number;
    trackingAttached?: boolean;
    // Server-only: binds "confirm payment" to the browser that opened the PayPal checkout.
    payNonce?: string;
    payStartedAt?: string;
    buyerEmail?: string;
  };
  shipTo?: { name?: string; line: string; address?: { address_line_1?: string; postal_code?: string } };
  shipment?: { carrier: string; trackingNumber: string; labelCheck: { match: boolean; read: string; reason: string } | null };
  claim?: Claim;
  events: { at: string; actor: "buyer" | "seller" | "handshake" | "paypal"; text: string; ref?: string }[];
  // Server-only party secrets; never sent to the browser (see publicDeal).
  sellerToken?: string;
  buyerToken?: string;
};

export type Viewer = { seller: boolean; buyer: boolean };
export type DealView = Omit<Deal, "sellerToken" | "buyerToken" | "sellerEmail" | "pendingOfferCents"> & {
  viewer: Viewer;
  acceptsOffers: boolean;
  deadlines: import("./deadlines").Deadline[];
  // True when deadlines run at demo speed (TIMER_SCALE < 1), so the UI can say so.
  demoClock: boolean;
};

export const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });
