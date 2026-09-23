import "server-only";
import { KEYS, type Store } from "./store";

// Flow numbers match the architecture diagram (public/haq-architecture.png).
// Only flows proven by a server side event are recorded here:
// 3 and 4 by index_lookup (it exists only in the Rule node), 6 and 7 by
// prepare_draft (only in Paperwork), 8 by request_human_handover, and 9 by a
// signed post-call webhook added to the ledger.
export type ServerFlow = 3 | 4 | 6 | 7 | 8 | 9;
export interface FlowEvent {
  flow: number;
  at: string;
}

const FLOW_TTL_SECONDS = 24 * 60 * 60;
const CONVERSATION_ID = /^conv_[A-Za-z0-9]{8,64}$/;

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && CONVERSATION_ID.test(value);
}

// Never throws: a flow record must not break the tool call it describes.
export async function recordFlows(store: Store, conversationId: unknown, flows: ServerFlow[], now = new Date()) {
  if (!isConversationId(conversationId)) return;
  try {
    for (const flow of flows) {
      await store.rpushWithTtl(
        KEYS.flows(conversationId),
        JSON.stringify({ flow, at: now.toISOString() }),
        FLOW_TTL_SECONDS,
      );
    }
  } catch (error) {
    console.error("HAQ: could not record flow event", error instanceof Error ? error.message : error);
  }
}

// First occurrence of each flow, in flow number order.
export async function readFlows(store: Store, conversationId: string): Promise<FlowEvent[]> {
  const raw = await store.lrange(KEYS.flows(conversationId), 0, -1);
  const first = new Map<number, string>();
  for (const item of raw) {
    try {
      const { flow, at } = JSON.parse(item) as FlowEvent;
      if (Number.isInteger(flow) && typeof at === "string" && !first.has(flow)) first.set(flow, at);
    } catch {
      // Ignore malformed entries.
    }
  }
  return [...first.entries()].sort((a, b) => a[0] - b[0]).map(([flow, at]) => ({ flow, at }));
}
