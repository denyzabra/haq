import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as indexLookup } from "../tools/index-lookup/route";
import { POST as prepareDraft } from "../tools/prepare-draft/route";
import { POST as handover } from "../tools/request-human-handover/route";
import { POST as postCall } from "../webhooks/post-call/route";
import { GET as verifyLedger } from "../ledger/verify/route";
import { getStore, KEYS, resetStoreForTests } from "@/lib/store";

const TOOL_SECRET = "test-tool-secret";
const WEBHOOK_SECRET = "test-webhook-secret";

function toolRequest(body: unknown, secret: string | null = TOOL_SECRET): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-haq-tool-secret"] = secret;
  return new Request("http://localhost/api/tools/x", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function signedWebhook(payload: unknown, secret = WEBHOOK_SECRET): Request {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return new Request("http://localhost/api/webhooks/post-call", {
    method: "POST",
    headers: { "content-type": "application/json", "elevenlabs-signature": `t=${t},v0=${sig}` },
    body,
  });
}

const postCallEvent = (conversationId: string) => ({
  type: "post_call_transcription",
  event_timestamp: 1_790_000_000,
  data: {
    agent_id: "agent_test",
    conversation_id: conversationId,
    transcript: [
      { role: "agent", message: "Hello" },
      { role: "agent", message: null, tool_calls: [{ tool_name: "index_lookup", params_as_json: '{"area":"Deira"}' }] },
    ],
    analysis: {
      transcript_summary: "Caller checked a Deira studio renewal.",
      call_successful: "success",
      evaluation_criteria_results: { disclosure_given: { result: "success" } },
      data_collection_results: {
        callback_consent: { value: true },
        opted_out: { value: false },
        escalated: { value: false },
        escalation_reason: { value: null },
      },
    },
  },
});

beforeEach(() => {
  for (const name of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "VERCEL"]) {
    delete process.env[name];
  }
  process.env.HAQ_TOOL_SECRET = TOOL_SECRET;
  process.env.ELEVENLABS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  resetStoreForTests();
});

describe("tool routes require the shared secret", () => {
  it.each([
    ["index-lookup", indexLookup],
    ["prepare-draft", prepareDraft],
    ["request-human-handover", handover],
  ])("%s rejects missing and wrong secrets with 401", async (_name, handler) => {
    expect((await handler(toolRequest({}, null))).status).toBe(401);
    expect((await handler(toolRequest({}, "wrong"))).status).toBe(401);
  });

  it("rejects everything when HAQ_TOOL_SECRET is unset", async () => {
    delete process.env.HAQ_TOOL_SECRET;
    const res = await indexLookup(toolRequest({ area: "Deira", unit_type: "studio", current_rent_aed: 30000 }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/tools/index-lookup", () => {
  it("returns the Decree 43 tier from the mock index", async () => {
    // Placeholder Deira studio average is 40,000. 30,000 is 25 percent below: 10 percent cap.
    const res = await indexLookup(toolRequest({ area: "ديرة", unit_type: "Studio", current_rent_aed: 30000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "checked",
      area: "Deira",
      unit_type: "Studio",
      current_rent_aed: 30000,
      index_average_aed: 40000,
      percent_below_average: 25,
      max_increase_percent: 10,
      max_new_rent_aed: 33000,
      clause: "Decree 43 of 2013, Article 1",
      data_source: "demo sample, not official",
    });
  });

  it("includes the notice check when both dates are given", async () => {
    const res = await indexLookup(
      toolRequest({
        area: "JVC",
        unit_type: "1BR",
        current_rent_aed: 70000,
        renewal_date: "2026-12-31",
        notice_received_date: "2026-10-03",
      }),
    );
    const body = await res.json();
    expect(body.notice).toMatchObject({ days_before_expiry: 89, notice_late: true });
  });

  it("accepts arguments wrapped in an ElevenLabs style `parameters` object", async () => {
    const res = await indexLookup(
      toolRequest({
        tool_call_id: "call_1",
        tool_name: "index_lookup",
        conversation_id: "conv_1",
        parameters: { area: "Deira", unit_type: "studio", current_rent_aed: 30000 },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "checked", max_increase_percent: 10 });
  });

  it("cites the verified notice article", async () => {
    const res = await indexLookup(
      toolRequest({ area: "Deira", unit_type: "studio", current_rent_aed: 30000, renewal_date: "2026-12-31", notice_received_date: "2026-09-01" }),
    );
    expect((await res.json()).notice.clause).toBe("Law 26 of 2007 as amended by Law 33 of 2008, Article 14");
  });

  it("treats empty optional dates as not given", async () => {
    const res = await indexLookup(
      toolRequest({ area: "Deira", unit_type: "studio", current_rent_aed: 30000, renewal_date: "", notice_received_date: " " }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).notice).toBeUndefined();
  });

  it("returns cannot_verify for an unknown area", async () => {
    const res = await indexLookup(toolRequest({ area: "Palm Jumeirah", unit_type: "studio", current_rent_aed: 90000 }));
    expect(await res.json()).toEqual({
      outcome: "cannot_verify",
      reason: "unknown_area",
      data_source: "demo sample, not official",
    });
  });

  it.each([
    ["zero rent", { area: "Deira", unit_type: "studio", current_rent_aed: 0 }],
    ["negative rent", { area: "Deira", unit_type: "studio", current_rent_aed: -10 }],
    ["missing area", { unit_type: "studio", current_rent_aed: 1000 }],
    ["impossible date", { area: "Deira", unit_type: "studio", current_rent_aed: 1000, renewal_date: "2026-02-30", notice_received_date: "2026-01-01" }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await indexLookup(toolRequest(body))).status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    expect((await indexLookup(toolRequest("{not json"))).status).toBe(400);
  });
});

describe("POST /api/tools/prepare-draft", () => {
  it("stores a draft and says it was not sent", async () => {
    const res = await prepareDraft(
      toolRequest({ area: "Dubai Marina", unit_type: "studio", current_rent_aed: 60000, proposed_rent_aed: 66000 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case_reference).toMatch(/^HAQ-D-[A-Z2-9]{8}$/);
    expect(body.sent).toBe(false);
    expect(body.summary).toContain("Not sent and not filed");
    expect(body.summary).toContain("Decree 43 of 2013, Article 1");
    expect(body.summary).toContain("above that maximum");

    const stored = await getStore().lrange(KEYS.drafts, 0, -1);
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0]).case_reference).toBe(body.case_reference);
  });
});

describe("POST /api/tools/request-human-handover", () => {
  it("queues the handover and returns a callback message", async () => {
    const res = await handover(toolRequest({ reason: "distress", summary: "Caller is facing eviction." }));
    const body = await res.json();
    expect(body.reference).toMatch(/^HAQ-H-[A-Z2-9]{8}$/);
    expect(body.callback_message).toContain(body.reference);
    const queue = await getStore().lrange(KEYS.handovers, 0, -1);
    expect(JSON.parse(queue[0])).toMatchObject({ reason: "distress", status: "open" });
  });

  it("requires a reason and summary", async () => {
    expect((await handover(toolRequest({ reason: "" }))).status).toBe(400);
  });
});

describe("POST /api/webhooks/post-call and GET /api/ledger/verify", () => {
  it("rejects an unsigned or wrongly signed webhook", async () => {
    const unsigned = new Request("http://localhost/api/webhooks/post-call", {
      method: "POST",
      body: JSON.stringify(postCallEvent("c1")),
    });
    expect((await postCall(unsigned)).status).toBe(401);
    expect((await postCall(signedWebhook(postCallEvent("c1"), "other-secret"))).status).toBe(401);
    expect(await (await verifyLedger()).json()).toEqual({ ok: true, length: 0 });
  });

  it("appends verified events to the ledger with consent fields and tool calls", async () => {
    const res = await postCall(signedWebhook(postCallEvent("c1")));
    expect(await res.json()).toEqual({ received: true, ledger_index: 0 });

    const [raw] = await getStore().lrange(KEYS.ledger, 0, -1);
    const { entry } = JSON.parse(raw);
    expect(entry).toMatchObject({
      conversation_id: "c1",
      transcript_summary: "Caller checked a Deira studio renewal.",
      tool_calls: [{ tool_name: "index_lookup", params_as_json: '{"area":"Deira"}' }],
      consent: { callback_consent: true, opted_out: false, escalated: false, escalation_reason: null },
    });
  });

  it("keeps the chain valid under concurrent webhooks", async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => postCall(signedWebhook(postCallEvent(`c${i}`)))),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await (await verifyLedger()).json()).toEqual({ ok: true, length: 10 });
  });

  it("reports the first broken index after tampering", async () => {
    for (let i = 0; i < 3; i++) await postCall(signedWebhook(postCallEvent(`c${i}`)));
    const store = getStore();
    const records = (await store.lrange(KEYS.ledger, 0, -1)).map((r) => JSON.parse(r));
    records[1].entry.transcript_summary = "edited";
    resetStoreForTests();
    const fresh = getStore();
    for (const r of records) await fresh.rpush(KEYS.ledger, JSON.stringify(r));
    expect(await (await verifyLedger()).json()).toEqual({ ok: false, length: 3, broken_index: 1 });
  });

  it("acknowledges but ignores other event types", async () => {
    const res = await postCall(signedWebhook({ type: "post_call_audio", data: {} }));
    expect(await res.json()).toEqual({ received: true, ignored: "post_call_audio" });
  });
});
