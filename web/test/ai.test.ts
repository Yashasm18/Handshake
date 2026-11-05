import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The AI chain: paid models first, then free vision models when OpenRouter refuses the paid ones
// (an account out of credit gets 402). Free models are "thinking" models, so reasoning is turned off
// for them, or they can spend the whole token budget thinking and return no answer.
const calls: { url: string; model: string; reasoning?: unknown; provider?: unknown; effort?: unknown; auth?: string; timeout: boolean }[] = [];
let reply: (model: string) => Response;
vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  const auth = (init.headers as Record<string, string>).Authorization;
  calls.push({ url, model: body.model, reasoning: body.reasoning, provider: body.provider, effort: body.reasoning_effort, auth, timeout: Boolean(init.signal) });
  return reply(body.model);
}));
vi.spyOn(console, "error").mockImplementation(() => {});

process.env.OPENROUTER_API_KEY = "or-key";
const { structured, text, DEFAULT_MODELS, repairText, retryWaitMs } = await import("@/lib/server/ai");
// Without a Groq key (most tests), Groq models are skipped.
const WITHOUT_GROQ = DEFAULT_MODELS.filter((m) => !m.startsWith("groq:"));
const Schema = z.object({ risk: z.enum(["LOW", "HIGH"]) });
const ask = () => structured({ name: "t", schema: Schema, system: "s", user: [text("u")] });
const answer = (content: string) => Response.json({ choices: [{ message: { content } }] });
const outOfCredit = () => Response.json({ error: { message: "Insufficient credits" } }, { status: 402 });

afterEach(() => {
  calls.length = 0;
  delete process.env.AI_MODELS;
  delete process.env.GROQ_API_KEY;
  for (const n of [2, 3, 4]) delete process.env[`OPENROUTER_API_KEY_${n}`];
  (globalThis as { __hsKeySkip?: Map<string, unknown> }).__hsKeySkip = new Map();
});

describe("the AI model chain", () => {
  it("uses the paid model when it answers, with its usual settings", async () => {
    reply = () => answer('{"risk":"HIGH"}');
    expect(await ask()).toEqual({ risk: "HIGH" });
    expect(calls).toEqual([{ url: "https://openrouter.ai/api/v1/chat/completions", model: DEFAULT_MODELS[0], reasoning: undefined, provider: { data_collection: "deny" }, effort: undefined, auth: "Bearer or-key", timeout: true }]);
  });

  it("an account out of credit falls through to a free model, with reasoning off", async () => {
    reply = (m) => (m.endsWith(":free") ? answer('{"risk":"LOW"}') : outOfCredit());
    expect(await ask()).toEqual({ risk: "LOW" });
    // The second paid model doesn't even try: the first one just found this account has no credit.
    expect(calls.map((c) => c.model)).toEqual([WITHOUT_GROQ[0], WITHOUT_GROQ.at(-1)]);
    expect(calls.at(-1)?.reasoning).toEqual({ enabled: false });
  });

  it("an empty answer (a model that only thought) moves on to the next model", async () => {
    reply = (m) => (m === DEFAULT_MODELS[0] ? answer("") : answer('{"risk":"HIGH"}'));
    expect(await ask()).toEqual({ risk: "HIGH" });
    expect(calls.map((c) => c.model)).toEqual(DEFAULT_MODELS.slice(0, 2));
  });

  it("people's data only goes to providers that don't keep or train on it: a model without one fails safely", async () => {
    const noSuchProvider = () => Response.json({ error: { message: "No endpoints found matching your data policy" } }, { status: 404 });
    reply = (m) => (m.endsWith(":free") ? noSuchProvider() : outOfCredit());
    await expect(ask()).rejects.toThrow("data policy");
    expect(calls.every((c) => JSON.stringify(c.provider) === '{"data_collection":"deny"}')).toBe(true);
  });

  it("anything outside the schema is never returned", async () => {
    reply = () => answer('{"risk":"MAYBE"}');
    await expect(ask()).rejects.toThrow();
    expect(calls).toHaveLength(WITHOUT_GROQ.length);
  });

  it("with a Groq key, an account out of credit carries on with Groq's free model, which never trains on it", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    reply = (m) => (m === "qwen/qwen3.8-27b" ? answer('{"risk":"HIGH"}') : outOfCredit());
    expect(await ask()).toEqual({ risk: "HIGH" });
    expect(calls.at(-1)).toMatchObject({ url: "https://api.groq.com/openai/v1/chat/completions", model: "qwen/qwen3.8-27b", effort: "none", provider: undefined, auth: "Bearer groq-key" });
    // The OpenRouter key never goes to Groq, and the Groq key never goes to OpenRouter.
    expect(calls.filter((c) => c.url.includes("openrouter")).every((c) => c.auth === "Bearer or-key")).toBe(true);
  });

  it("Groq is tried once more after a short rate limit or a one-off JSON failure, never after a long wait", async () => {
    const err = (status: number, message: string) => Object.assign(new Error(message), { status });
    expect(retryWaitMs(err(429, "Limit 1000, Used 928. Please try again in 8.34s. Need more tokens?"))).toBe(8590);
    expect(retryWaitMs(err(429, "Please try again in 2m30s."))).toBeNull();
    expect(retryWaitMs(err(429, "Please try again in 45.1s."))).toBeNull();
    expect(retryWaitMs(err(400, "Failed to generate JSON. Please adjust your prompt."))).toBe(0);
    expect(retryWaitMs(err(401, "Invalid API Key"))).toBeNull();

    process.env.GROQ_API_KEY = "groq-key";
    process.env.AI_MODELS = "groq:qwen/qwen3.8-27b";
    let n = 0;
    reply = () => (++n === 1 ? Response.json({ error: { message: "Failed to generate JSON." } }, { status: 400 }) : answer('{"risk":"LOW"}'));
    expect(await ask()).toEqual({ risk: "LOW" });
    expect(calls).toHaveLength(2);
  });

  it("curly quotes and dashes that arrive with their top byte dropped are restored", async () => {
    expect(repairText({ signs: ["\u001cSend as Friends & Family\u001d", "I\u0019ll text you \u0014 now"], n: 2, ok: true })).toEqual({
      signs: ["\u201cSend as Friends & Family\u201d", "I\u2019ll text you \u2014 now"], n: 2, ok: true,
    });
    expect(repairText("line one\nline two\ttab")).toBe("line one\nline two\ttab");
  });

  it("rotates through OpenRouter keys: an account out of credit hands over to the next key, same model", async () => {
    Object.assign(process.env, { OPENROUTER_API_KEY_2: "or-key-2", OPENROUTER_API_KEY_3: "or-key-3" });
    const broke = new Set(["Bearer or-key", "Bearer or-key-2"]);
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const auth = (init!.headers as Record<string, string>).Authorization;
      const body = JSON.parse(String(init!.body));
      calls.push({ url: String(url), model: body.model, auth, timeout: true });
      return broke.has(auth) && !body.model.endsWith(":free") ? outOfCredit() : answer('{"risk":"HIGH"}');
    });
    expect(await ask()).toEqual({ risk: "HIGH" });
    expect(calls.map((c) => [c.model, c.auth])).toEqual([
      [DEFAULT_MODELS[0], "Bearer or-key"],
      [DEFAULT_MODELS[0], "Bearer or-key-2"],
      [DEFAULT_MODELS[0], "Bearer or-key-3"],
    ]);
    // The next check goes straight to key 3: the empty accounts are skipped for a while.
    calls.length = 0;
    await ask();
    expect(calls.map((c) => c.auth)).toEqual(["Bearer or-key-3"]);
  });

  it("when every key is out of credit, the free models still run (they don't use credit)", async () => {
    process.env.OPENROUTER_API_KEY_2 = "or-key-2";
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ url: String(url), model: body.model, auth: (init!.headers as Record<string, string>).Authorization, timeout: true });
      return body.model.endsWith(":free") ? answer('{"risk":"LOW"}') : outOfCredit();
    });
    expect(await ask()).toEqual({ risk: "LOW" });
    // The first paid model tried with both keys; the second is skipped (both accounts are empty);
    // then the free model with key 1.
    expect(calls.map((c) => [c.model, c.auth])).toEqual([
      [DEFAULT_MODELS[0], "Bearer or-key"],
      [DEFAULT_MODELS[0], "Bearer or-key-2"],
      [DEFAULT_MODELS.at(-1), "Bearer or-key"],
    ]);
    // Next time the paid models are skipped without a call: straight to the free one.
    calls.length = 0;
    await ask();
    expect(calls.map((c) => c.model)).toEqual([DEFAULT_MODELS.at(-1)]);
  });

  it("AI_MODELS replaces the list without a code change", async () => {
    process.env.AI_MODELS = " vendor/one , vendor/two:free ";
    reply = (m) => (m === "vendor/two:free" ? answer('{"risk":"LOW"}') : outOfCredit());
    expect(await ask()).toEqual({ risk: "LOW" });
    expect(calls.map((c) => c.model)).toEqual(["vendor/one", "vendor/two:free"]);
  });
});
