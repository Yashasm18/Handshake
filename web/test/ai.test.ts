import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The AI chain: paid models first, then free vision models when OpenRouter refuses the paid ones
// (an account out of credit gets 402). Free models are "thinking" models, so reasoning is turned off
// for them, or they can spend the whole token budget thinking and return no answer.
const calls: { model: string; reasoning?: unknown; timeout: boolean }[] = [];
let reply: (model: string) => Response;
vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  calls.push({ model: body.model, reasoning: body.reasoning, timeout: Boolean(init.signal) });
  return reply(body.model);
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const { structured, text, DEFAULT_MODELS } = await import("@/lib/server/ai");
const Schema = z.object({ risk: z.enum(["LOW", "HIGH"]) });
const ask = () => structured({ name: "t", schema: Schema, system: "s", user: [text("u")] });
const answer = (content: string) => Response.json({ choices: [{ message: { content } }] });
const outOfCredit = () => Response.json({ error: { message: "Insufficient credits" } }, { status: 402 });

afterEach(() => {
  calls.length = 0;
  delete process.env.AI_MODELS;
});

describe("the AI model chain", () => {
  it("uses the paid model when it answers, with its usual settings", async () => {
    reply = () => answer('{"risk":"HIGH"}');
    expect(await ask()).toEqual({ risk: "HIGH" });
    expect(calls).toEqual([{ model: DEFAULT_MODELS[0], reasoning: undefined, timeout: true }]);
  });

  it("an account out of credit falls through to a free model, with reasoning off", async () => {
    reply = (m) => (m.endsWith(":free") ? answer('{"risk":"LOW"}') : outOfCredit());
    expect(await ask()).toEqual({ risk: "LOW" });
    expect(calls.map((c) => c.model)).toEqual(DEFAULT_MODELS.slice(0, 3));
    expect(calls[2].reasoning).toEqual({ enabled: false });
  });

  it("an empty answer (a model that only thought) moves on to the next model", async () => {
    reply = (m) => (m === DEFAULT_MODELS[2] ? answer("") : m.endsWith(":free") ? answer('{"risk":"HIGH"}') : outOfCredit());
    expect(await ask()).toEqual({ risk: "HIGH" });
    expect(calls.at(-1)?.model).toBe(DEFAULT_MODELS[3]);
  });

  it("anything outside the schema is never returned", async () => {
    reply = () => answer('{"risk":"MAYBE"}');
    await expect(ask()).rejects.toThrow();
    expect(calls).toHaveLength(DEFAULT_MODELS.length);
  });

  it("AI_MODELS replaces the list without a code change", async () => {
    process.env.AI_MODELS = " vendor/one , vendor/two:free ";
    reply = (m) => (m === "vendor/two:free" ? answer('{"risk":"LOW"}') : outOfCredit());
    expect(await ask()).toEqual({ risk: "LOW" });
    expect(calls.map((c) => c.model)).toEqual(["vendor/one", "vendor/two:free"]);
  });
});
