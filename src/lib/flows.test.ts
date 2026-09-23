import { describe, expect, it } from "vitest";
import { isConversationId, readFlows, recordFlows } from "./flows";
import { createStore, KEYS } from "./store";

const CONV = "conv_01abcdefghijklmnop";

describe("isConversationId", () => {
  it.each([CONV, "conv_12345678"])("accepts %s", (id) => expect(isConversationId(id)).toBe(true));
  it.each(["", "conv_", "conv_abc", "agent_123456789", "conv_../../x", "conv_abc def ghi", 42, undefined])(
    "rejects %j",
    (id) => expect(isConversationId(id)).toBe(false),
  );
});

describe("recordFlows and readFlows", () => {
  it("records flows and returns the first occurrence of each, in order", async () => {
    const store = createStore({});
    await recordFlows(store, CONV, [6, 7], new Date("2026-09-23T10:00:05Z"));
    await recordFlows(store, CONV, [3, 4], new Date("2026-09-23T10:00:01Z"));
    await recordFlows(store, CONV, [4], new Date("2026-09-23T10:00:09Z"));
    expect(await readFlows(store, CONV)).toEqual([
      { flow: 3, at: "2026-09-23T10:00:01.000Z" },
      { flow: 4, at: "2026-09-23T10:00:01.000Z" },
      { flow: 6, at: "2026-09-23T10:00:05.000Z" },
      { flow: 7, at: "2026-09-23T10:00:05.000Z" },
    ]);
  });

  it("ignores a missing or invalid conversation id", async () => {
    const store = createStore({});
    await recordFlows(store, undefined, [4]);
    await recordFlows(store, "not-a-conversation", [4]);
    expect(await store.lrange(KEYS.flows("not-a-conversation"), 0, -1)).toEqual([]);
  });

  it("expires flow events after 24 hours", async () => {
    let now = Date.UTC(2026, 8, 23);
    const store = createStore({}, () => now);
    await recordFlows(store, CONV, [8]);
    now += 24 * 60 * 60 * 1000 + 1;
    expect(await readFlows(store, CONV)).toEqual([]);
  });

  it("never throws when the store fails", async () => {
    const store = createStore({});
    store.rpushWithTtl = async () => {
      throw new Error("redis down");
    };
    await expect(recordFlows(store, CONV, [4])).resolves.toBeUndefined();
  });
});
