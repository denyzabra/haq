import { Redis } from "@upstash/redis";

// Minimal storage surface used by HAQ. Values are JSON strings; callers parse.
export interface Store {
  readonly kind: "upstash" | "memory";
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  get(key: string): Promise<string | null>;
  // Atomically: if the value at headKey (or `genesis` when unset) equals
  // expectedHead, append value to listKey and set headKey to newHead.
  // Returns false when another writer moved the head first.
  appendIfHead(args: {
    listKey: string;
    headKey: string;
    expectedHead: string;
    genesis: string;
    value: string;
    newHead: string;
  }): Promise<boolean>;
}

type Env = Record<string, string | undefined>;

export class StoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreConfigError";
  }
}

// The Vercel Upstash integration may create either pair of names.
export function resolveKvConfig(env: Env): { url: string; token: string } | null {
  const pairs: Array<[string, string]> = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  for (const [urlName, tokenName] of pairs) {
    const url = env[urlName];
    const token = env[tokenName];
    if (url && token) return { url, token };
  }
  return null;
}

export function isProductionRuntime(env: Env): boolean {
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}

const APPEND_IF_HEAD_LUA = `
local head = redis.call('GET', KEYS[2])
if not head then head = ARGV[2] end
if head ~= ARGV[1] then return 0 end
redis.call('RPUSH', KEYS[1], ARGV[3])
redis.call('SET', KEYS[2], ARGV[4])
return 1
`;

class UpstashStore implements Store {
  readonly kind = "upstash" as const;
  private readonly redis: Redis;
  private readonly appendScript;

  constructor(url: string, token: string) {
    // Raw strings in and out; a hex hash must never be coerced to a number.
    this.redis = new Redis({ url, token, automaticDeserialization: false });
    this.appendScript = this.redis.createScript<number>(APPEND_IF_HEAD_LUA);
  }

  rpush(key: string, value: string) {
    return this.redis.rpush(key, value);
  }

  lrange(key: string, start: number, stop: number) {
    return this.redis.lrange<string>(key, start, stop);
  }

  get(key: string) {
    return this.redis.get<string>(key);
  }

  async appendIfHead(a: Parameters<Store["appendIfHead"]>[0]) {
    const result = await this.appendScript.exec(
      [a.listKey, a.headKey],
      [a.expectedHead, a.genesis, a.value, a.newHead],
    );
    return Number(result) === 1;
  }
}

// For local development and tests only. Serverless instances do not share
// memory, so this must never back a deployed ledger (see createStore).
class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private readonly lists = new Map<string, string[]>();
  private readonly values = new Map<string, string>();

  async rpush(key: string, value: string) {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number) {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    const begin = start < 0 ? Math.max(0, list.length + start) : start;
    return list.slice(begin, end);
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  // No await inside, so the check and the write cannot interleave.
  async appendIfHead(a: Parameters<Store["appendIfHead"]>[0]) {
    const head = this.values.get(a.headKey) ?? a.genesis;
    if (head !== a.expectedHead) return false;
    const list = this.lists.get(a.listKey) ?? [];
    list.push(a.value);
    this.lists.set(a.listKey, list);
    this.values.set(a.headKey, a.newHead);
    return true;
  }
}

export function createStore(env: Env = process.env): Store {
  const kv = resolveKvConfig(env);
  if (kv) return new UpstashStore(kv.url, kv.token);
  if (isProductionRuntime(env)) {
    throw new StoreConfigError(
      "Upstash Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN " +
        "(or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN). The in-memory store " +
        "is disabled in production because it would lose the audit ledger between requests.",
    );
  }
  return new MemoryStore();
}

let singleton: Store | undefined;

export function getStore(): Store {
  singleton ??= createStore();
  return singleton;
}

export function resetStoreForTests(): void {
  singleton = undefined;
}

export const KEYS = {
  ledger: "haq:ledger",
  ledgerHead: "haq:ledger:head",
  drafts: "haq:drafts",
  handovers: "haq:handovers",
} as const;
