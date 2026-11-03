import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Deal } from "../types";

// A single JSON file is enough for one Render instance. On Render, DATA_DIR points at a persistent disk
// so deals survive redeploys; locally it falls back to web/.data.
const FILE = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "deals.json");

let deals: Map<string, Deal> | null = null;
let writing: Promise<void> = Promise.resolve();

async function load() {
  if (deals) return deals;
  try {
    const list = JSON.parse(await readFile(FILE, "utf8")) as Deal[];
    deals = new Map(list.map((d) => [d.id, d]));
  } catch {
    deals = new Map();
  }
  return deals;
}

function persist() {
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    // Write then rename, so a crash mid-write never leaves a half-written file behind.
    await writeFile(`${FILE}.tmp`, JSON.stringify([...deals!.values()], null, 2));
    await rename(`${FILE}.tmp`, FILE);
  });
  return writing;
}

// 128-bit ids: a deal link can't be guessed or enumerated.
export const newId = () => randomBytes(16).toString("base64url");
export const newToken = () => randomBytes(32).toString("base64url");

export async function getDeal(id: string) {
  return (await load()).get(id) ?? null;
}

export async function saveDeal(deal: Deal) {
  (await load()).set(deal.id, deal);
  await persist();
  return deal;
}

// Serialize work per deal so two clicks can never run the same money step twice.
const locks = new Map<string, Promise<unknown>>();
export async function withDeal<T>(id: string, fn: (deal: Deal) => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const deal = await getDeal(id);
    if (!deal) throw new HttpError(404, "This deal doesn't exist.");
    const out = await fn(deal);
    deal.updatedAt = new Date().toISOString();
    await saveDeal(deal);
    return out;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

export function log(deal: Deal, actor: Deal["events"][number]["actor"], text: string, ref?: string) {
  deal.events.push({ at: new Date().toISOString(), actor, text, ref });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
