import { describe, expect, it } from "vitest";
import {
  appendToLedger,
  canonicalJson,
  GENESIS_HASH,
  hashEntry,
  readLedger,
  verifyChain,
  type LedgerRecord,
} from "./ledger";
import { createStore, type Store } from "./store";

const memory = () => createStore({});

describe("canonicalJson", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[{"y":2,"z":1}]},"b":1}',
    );
  });

  it("hashes equal entries identically regardless of key order", () => {
    expect(hashEntry(GENESIS_HASH, { a: 1, b: 2 })).toBe(hashEntry(GENESIS_HASH, { b: 2, a: 1 }));
  });
});

describe("verifyChain", () => {
  async function chainOf(n: number): Promise<LedgerRecord[]> {
    const store = memory();
    for (let i = 0; i < n; i++) await appendToLedger(store, { n: i });
    return readLedger(store);
  }

  it("accepts an empty chain", () => {
    expect(verifyChain([])).toEqual({ ok: true, length: 0 });
  });

  it("accepts a valid chain", async () => {
    const chain = await chainOf(5);
    expect(chain[0].prev_hash).toBe(GENESIS_HASH);
    expect(verifyChain(chain)).toEqual({ ok: true, length: 5 });
  });

  it("finds a tampered entry in the middle", async () => {
    const chain = await chainOf(5);
    chain[2] = { ...chain[2], entry: { n: 99 } };
    expect(verifyChain(chain)).toEqual({ ok: false, length: 5, broken_index: 2 });
  });

  it("finds a tampered hash", async () => {
    const chain = await chainOf(5);
    chain[3] = { ...chain[3], hash: "f".repeat(64) };
    expect(verifyChain(chain)).toEqual({ ok: false, length: 5, broken_index: 3 });
  });

  it("finds a deleted entry", async () => {
    const chain = await chainOf(5);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toMatchObject({ ok: false, broken_index: 1 });
  });
});

describe("appendToLedger concurrency", () => {
  it("keeps the chain valid when many appends fire at once", async () => {
    const store = memory();
    await Promise.all(Array.from({ length: 20 }, (_, i) => appendToLedger(store, { call: i })));
    const chain = await readLedger(store);
    expect(chain).toHaveLength(20);
    expect(verifyChain(chain)).toEqual({ ok: true, length: 20 });
  });

  it("retries when another instance moves the head between read and write", async () => {
    const inner = memory();
    let raced = false;
    // Simulates a second serverless instance that appends just before our compare and set.
    const racing: Store = {
      ...inner,
      kind: inner.kind,
      rpush: inner.rpush.bind(inner),
      lrange: inner.lrange.bind(inner),
      get: inner.get.bind(inner),
      incrWindow: inner.incrWindow.bind(inner),
      rpushWithTtl: inner.rpushWithTtl.bind(inner),
      async appendIfHead(args) {
        if (!raced) {
          raced = true;
          const other = { index: 0, prev_hash: GENESIS_HASH, hash: hashEntry(GENESIS_HASH, { other: true }), entry: { other: true } };
          await inner.appendIfHead({ ...args, value: JSON.stringify(other), newHead: other.hash });
        }
        return inner.appendIfHead(args);
      },
    };
    const record = await appendToLedger(racing, { mine: true });
    expect(record.index).toBe(1);
    const chain = await readLedger(inner);
    expect(chain.map((r) => r.entry)).toEqual([{ other: true }, { mine: true }]);
    expect(verifyChain(chain)).toEqual({ ok: true, length: 2 });
  });
});
