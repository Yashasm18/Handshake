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
  paypal: {
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    capturedCents?: number;
    feeCents?: number;
    netCents?: number;
    payoutBatchId?: string;
    payoutCents?: number;
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
export type DealView = Omit<Deal, "sellerToken" | "buyerToken" | "sellerEmail"> & { viewer: Viewer };

export const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });
