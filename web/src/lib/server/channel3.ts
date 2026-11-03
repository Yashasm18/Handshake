import "server-only";

export type Comp = { id: string; title: string; priceCents: number; image?: string; url?: string; merchant?: string };

type C3Offer = { price?: number | { price?: number }; url?: string; buy_url?: string; website?: { name?: string } };
type C3Product = { id: string; title: string; images?: ({ url?: string } | string)[]; offers?: C3Offer[] };

// Accessories pollute a search for the item itself ("iPhone 13" returns cases at $12).
const ACCESSORY = /\b(cases?|covers?|protectors?|chargers?|cables?|adapters?|straps?|bands?|skins?|sleeves?|mounts?|stands?|holders?|films?|glass|docks?|docking|replacement parts?)\b/i;

export async function searchComps(query: string, limit = 12): Promise<Comp[]> {
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: { "x-api-key": process.env.CHANNEL3_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Channel3 search failed (${res.status})`);
  const json = (await res.json()) as { products?: C3Product[] };
  const comps: Comp[] = [];
  for (const p of json.products ?? []) {
    const offer = p.offers?.[0];
    const raw = typeof offer?.price === "number" ? offer.price : offer?.price?.price;
    if (!raw) continue;
    const img = p.images?.[0];
    comps.push({
      id: p.id,
      title: p.title,
      priceCents: Math.round(raw * 100),
      image: typeof img === "string" ? img : img?.url,
      url: offer?.buy_url ?? offer?.url,
      merchant: offer?.website?.name,
    });
  }
  return comps;
}

export function itemComps(query: string, comps: Comp[]) {
  const wantsAccessory = ACCESSORY.test(query);
  return comps.filter((c) => wantsAccessory || !ACCESSORY.test(c.title));
}

// Pricing a damaged part ("left Joy-Con") must not pick up the whole product ("Switch OLED Model").
// Keep only listings that name the part, and drop any priced like the item itself.
const SIDE_WORDS = /\b(left|right|front|back|rear|top|bottom|the|a|an|of|and|white|black)\b/gi;
export function partComps(part: string, comps: Comp[], itemPriceCents: number) {
  const words = part.toLowerCase().replace(SIDE_WORDS, " ").split(/[^a-z0-9-]+/).filter((w) => w.length > 2);
  const names = (title: string) => words.every((w) => title.toLowerCase().includes(w));
  // A broken screen isn't priced by screen protectors; a broken charger may be priced by chargers.
  const partIsAccessory = ACCESSORY.test(part);
  return comps.filter((c) => (!words.length || names(c.title)) && (partIsAccessory || !ACCESSORY.test(c.title)) && c.priceCents < itemPriceCents * 0.75);
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
