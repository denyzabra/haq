import { describe, expect, it } from "vitest";
import { createStore, isProductionRuntime, resolveKvConfig, StoreConfigError } from "./store";

describe("resolveKvConfig", () => {
  it("accepts the KV_REST_API pair", () => {
    expect(resolveKvConfig({ KV_REST_API_URL: "https://a", KV_REST_API_TOKEN: "t" })).toEqual({
      url: "https://a",
      token: "t",
    });
  });

  it("accepts the UPSTASH_REDIS_REST pair", () => {
    expect(
      resolveKvConfig({ UPSTASH_REDIS_REST_URL: "https://b", UPSTASH_REDIS_REST_TOKEN: "u" }),
    ).toEqual({ url: "https://b", token: "u" });
  });

  it("ignores an incomplete pair", () => {
    expect(resolveKvConfig({ KV_REST_API_URL: "https://a", UPSTASH_REDIS_REST_TOKEN: "u" })).toBeNull();
  });
});

describe("createStore", () => {
  it("uses memory for local development", () => {
    expect(createStore({ NODE_ENV: "development" }).kind).toBe("memory");
  });

  it("uses Upstash when configured", () => {
    expect(
      createStore({ NODE_ENV: "production", KV_REST_API_URL: "https://a.upstash.io", KV_REST_API_TOKEN: "t" })
        .kind,
    ).toBe("upstash");
  });

  it.each([
    ["on Vercel", { VERCEL: "1", NODE_ENV: "development" }],
    ["in production", { NODE_ENV: "production" }],
  ])("refuses to fall back to memory %s", (_label, env) => {
    expect(isProductionRuntime(env)).toBe(true);
    expect(() => createStore(env)).toThrow(StoreConfigError);
  });
});

describe("memory appendIfHead", () => {
  it("appends only when the head matches", async () => {
    const store = createStore({});
    const base = { listKey: "l", headKey: "h", genesis: "g", value: "v1" };
    expect(await store.appendIfHead({ ...base, expectedHead: "g", newHead: "h1" })).toBe(true);
    expect(await store.appendIfHead({ ...base, expectedHead: "g", newHead: "h2" })).toBe(false);
    expect(await store.lrange("l", 0, -1)).toEqual(["v1"]);
    expect(await store.get("h")).toBe("h1");
  });
});
