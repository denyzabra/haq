import { createHash } from "node:crypto";
import { KEYS, type Store } from "./store";

// Hash chained audit ledger: each record stores
// hash = sha256(prev_hash + canonical_json(entry)).

export const GENESIS_HASH = "0".repeat(64);

export interface LedgerRecord<T = unknown> {
  index: number;
  prev_hash: string;
  hash: string;
  entry: T;
}

export type VerifyResult = { ok: true; length: number } | { ok: false; length: number; broken_index: number };

// JSON with object keys sorted recursively, so the same entry always hashes the same.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function hashEntry(prevHash: string, entry: unknown): string {
  return createHash("sha256").update(prevHash + canonicalJson(entry)).digest("hex");
}

export function verifyChain(records: LedgerRecord[]): VerifyResult {
  let prev = GENESIS_HASH;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.index !== i || r.prev_hash !== prev || r.hash !== hashEntry(prev, r.entry)) {
      return { ok: false, length: records.length, broken_index: i };
    }
    prev = r.hash;
  }
  return { ok: true, length: records.length };
}

// Serialises appends within one process so concurrent webhooks do not spin on
// retries. The compare and set in the store is what guarantees correctness
// across processes and serverless instances.
let queue: Promise<unknown> = Promise.resolve();

function withLocalLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const MAX_ATTEMPTS = 20;

export function appendToLedger<T>(store: Store, entry: T): Promise<LedgerRecord<T>> {
  return withLocalLock(async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const prevHash = (await store.get(KEYS.ledgerHead)) ?? GENESIS_HASH;
      const tail = await store.lrange(KEYS.ledger, -1, -1);
      const index = tail.length === 0 ? 0 : (JSON.parse(tail[0]) as LedgerRecord).index + 1;
      const record: LedgerRecord<T> = { index, prev_hash: prevHash, hash: hashEntry(prevHash, entry), entry };
      const appended = await store.appendIfHead({
        listKey: KEYS.ledger,
        headKey: KEYS.ledgerHead,
        expectedHead: prevHash,
        genesis: GENESIS_HASH,
        value: JSON.stringify(record),
        newHead: record.hash,
      });
      if (appended) return record;
      // Another instance appended first. Back off briefly with jitter, then retry.
      await new Promise((resolve) => setTimeout(resolve, 5 + Math.random() * 20 * (attempt + 1)));
    }
    throw new Error("Ledger append failed after repeated contention");
  });
}

export async function readLedger(store: Store, start = 0, stop = -1): Promise<LedgerRecord[]> {
  const raw = await store.lrange(KEYS.ledger, start, stop);
  return raw.map((r) => JSON.parse(r) as LedgerRecord);
}
