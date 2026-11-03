import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RetryableError, enforce, listDue } from "../src/handshake";

// A stand-in for the web app's /api/internal/timers route.
let server: Server;
let respond: (method: string, body: string, auth: string | undefined) => [number, unknown] = () => [200, {}];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const [status, json] = respond(req.method!, body, req.headers.authorization);
      res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.HANDSHAKE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  process.env.TIMERS_SECRET = "s3cret";
});
afterAll(() => server.close());

describe("handshake client", () => {
  it("sends the shared secret and reads the due list", async () => {
    respond = (m, _b, auth) => (m === "GET" && auth === "Bearer s3cret" ? [200, { due: [{ dealId: "d1", kind: "SHIP_BY", at: 1 }] }] : [401, {}]);
    expect(await listDue()).toEqual([{ dealId: "d1", kind: "SHIP_BY", at: 1 }]);
  });

  it("posts one deadline to enforce", async () => {
    respond = (m, b) => [200, { ...JSON.parse(b), outcome: m === "POST" ? "done" : "?", detail: "ok" }];
    expect(await enforce("d1", "AUTO_RELEASE")).toMatchObject({ dealId: "d1", kind: "AUTO_RELEASE", outcome: "done" });
  });

  it("marks server errors retryable, so the workflow retries the run", async () => {
    respond = () => [502, { error: "PayPal is down" }];
    await expect(enforce("d1", "SHIP_BY")).rejects.toBeInstanceOf(RetryableError);
  });

  it("doesn't retry a request the app rejected", async () => {
    respond = () => [400, { error: "bad kind" }];
    const err = await enforce("d1", "NOPE").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RetryableError);
  });

  it("treats an unreachable app as retryable", async () => {
    const saved = process.env.HANDSHAKE_URL;
    process.env.HANDSHAKE_URL = "http://127.0.0.1:1";
    await expect(listDue()).rejects.toBeInstanceOf(RetryableError);
    process.env.HANDSHAKE_URL = saved;
  });
});
