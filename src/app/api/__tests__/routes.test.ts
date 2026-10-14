import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as indexLookup } from "../tools/index-lookup/route";
import { POST as prepareDraft } from "../tools/prepare-draft/route";
import { POST as handover } from "../tools/request-human-handover/route";
import { POST as postCall } from "../webhooks/post-call/route";
import { GET as verifyLedger } from "../ledger/verify/route";
import { GET as getFlows } from "../flows/[conversationId]/route";
import { computeIncreaseCap } from "@/lib/decree43";
import { DRAFT_NOTE } from "@/lib/draft-summary";
import { bandText, DATA_SOURCE, INDEX_ENTRIES, indexAverageAed } from "@/lib/mock-index";
import { BEDROOM_ALIASES } from "@/lib/index-aliases";
import { getStore, KEYS, resetStoreForTests } from "@/lib/store";

const TOOL_SECRET = "test-tool-secret";

// DLD row 1: AAA RESIDENCE, 1 bedroom, Al Barsha South Fourth (JVC). DLD's own
// result for a current rent of AED 60,000 is 5 percent, a new rent of AED 63,000.
const AAA = { area: "JVC", building: "Triple A Residence", bedrooms: "1 bedroom" };
const AAA_ENTRY = INDEX_ENTRIES.find((e) => e.building === "AAA RESIDENCE")!;
const AAA_AVERAGE = indexAverageAed(AAA_ENTRY);
// DLD row 3 and the boundary lookups: AL HAMRIA, 3 bedrooms, range 81,000 to 99,000.
const HAMRIA = { area: "Al Hamriya", building: "AL HAMRIA", bedrooms: "3 bed rooms+hall" };
// Arabic inputs are built from code points or read from the index, never typed.
const arabicIndic = (digits: string) => [...digits].map((d) => String.fromCharCode(0x0660 + Number(d))).join("");
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
    const res = await indexLookup(toolRequest({ ...AAA, current_rent_aed: 60000 }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/tools/index-lookup", () => {
  it("returns DLD's range for the building and the Decree 43 tier", async () => {
    const res = await indexLookup(toolRequest({ ...AAA, current_rent_aed: 60000 }));
    expect(res.status).toBe(200);
    const cap = computeIncreaseCap({ indexAverageAed: AAA_AVERAGE, currentRentAed: 60000 });
    expect(await res.json()).toEqual({
      outcome: "checked",
      area: "Al Barsha South Fourth",
      area_ar: AAA_ENTRY.area_ar,
      building: "AAA RESIDENCE",
      building_ar: AAA_ENTRY.building_ar,
      bedrooms: "1bed room+Hall",
      bedrooms_ar: AAA_ENTRY.bedrooms_ar,
      current_rent_aed: 60000,
      range_min_aed: 64038,
      range_max_aed: 78268,
      ...cap,
      dld_band_text_en: bandText(cap.max_increase_percent).en,
      dld_band_text_ar: bandText(cap.max_increase_percent).ar,
      data_source: "DLD Rental Index, building level, retrieved 14 October 2026",
    });
  });

  it("gives DLD's own result for DLD's check row", async () => {
    const res = await indexLookup(toolRequest({ ...AAA, current_rent_aed: 60000 }));
    expect(await res.json()).toMatchObject({ max_increase_percent: 5, max_increase_aed: 3000, max_new_rent_aed: 63000 });
  });

  it("matches DLD's official Arabic names and a rent in Arabic-Indic digits", async () => {
    const res = await indexLookup(
      toolRequest({
        area: AAA_ENTRY.area_ar,
        building: AAA_ENTRY.building_ar,
        bedrooms: AAA_ENTRY.bedrooms_ar,
        current_rent_aed: `${arabicIndic("60")}\u066C${arabicIndic("000")}`,
      }),
    );
    expect(await res.json()).toMatchObject({ outcome: "checked", building: "AAA RESIDENCE", current_rent_aed: 60000, max_new_rent_aed: 63000 });
  });

  it("matches a colloquial Arabic bedrooms alias", async () => {
    const colloquial = BEDROOM_ALIASES["1bed room+Hall"].find((a) => /[\u0600-\u06FF]/.test(a))!;
    const res = await indexLookup(toolRequest({ ...AAA, bedrooms: colloquial, current_rent_aed: 60000 }));
    expect(await res.json()).toMatchObject({ outcome: "checked", bedrooms: "1bed room+Hall" });
  });

  it.each([
    ["10.5 percent below rounds down to no increase", 80550, 0],
    ["10.6 percent below rounds up to 5 percent", 80460, 5],
    ["40.5 percent below rounds down to 15 percent", 53550, 15],
    ["40.9 percent below rounds up to 20 percent", 53190, 20],
  ])("follows the DLD calculator: %s", async (_label, rent, percent) => {
    const body = await (await indexLookup(toolRequest({ ...HAMRIA, current_rent_aed: rent }))).json();
    expect(body).toMatchObject({ max_increase_percent: percent, dld_band_text_en: bandText(percent).en, dld_band_text_ar: bandText(percent).ar });
    expect(body).not.toHaveProperty("band_boundary");
  });

  it("includes the notice check when both dates are given", async () => {
    const res = await indexLookup(
      toolRequest({ ...AAA, current_rent_aed: 60000, renewal_date: "2026-12-31", notice_received_date: "2026-10-03" }),
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
        parameters: { ...AAA, current_rent_aed: 60000 },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "checked", max_increase_percent: 5 });
  });

  it("cites the verified notice article", async () => {
    const res = await indexLookup(
      toolRequest({ ...AAA, current_rent_aed: 60000, renewal_date: "2026-12-31", notice_received_date: "2026-09-01" }),
    );
    expect((await res.json()).notice.clause).toBe("Law 26 of 2007 as amended by Law 33 of 2008, Article 14");
  });

  it("treats empty optional dates as not given", async () => {
    const res = await indexLookup(toolRequest({ ...AAA, current_rent_aed: 60000, renewal_date: "", notice_received_date: " " }));
    expect(res.status).toBe(200);
    expect((await res.json()).notice).toBeUndefined();
  });

  it.each([
    ["an unknown area", { ...AAA, area: "Palm Jumeirah" }, "unknown_area"],
    ["a known area with a building not in the index", { ...AAA, building: "Bloom Towers" }, "unknown_building"],
    ["bedrooms DLD did not list for the building", { ...AAA, bedrooms: "studio" }, "unknown_bedrooms"],
  ])("returns cannot_verify with the reason for %s", async (_label, intake, reason) => {
    const res = await indexLookup(toolRequest({ ...intake, current_rent_aed: 60000 }));
    expect(await res.json()).toEqual({ outcome: "cannot_verify", reason, data_source: DATA_SOURCE });
  });

  it.each([
    ["zero rent", { ...AAA, current_rent_aed: 0 }],
    ["negative rent", { ...AAA, current_rent_aed: -10 }],
    ["missing area", { building: AAA.building, bedrooms: AAA.bedrooms, current_rent_aed: 1000 }],
    ["missing building", { area: AAA.area, bedrooms: AAA.bedrooms, current_rent_aed: 1000 }],
    ["missing bedrooms", { area: AAA.area, building: AAA.building, current_rent_aed: 1000 }],
    ["missing rent", { ...AAA }],
    ["impossible date", { ...AAA, current_rent_aed: 1000, renewal_date: "2026-02-30", notice_received_date: "2026-01-01" }],
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
      toolRequest({ ...AAA, current_rent_aed: 60000, proposed_rent_aed: 66000 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.case_reference).toMatch(/^HAQ-D-[A-Z2-9]{8}$/);
    expect(body.sent).toBe(false);
    expect(body.summary).toContain("Not sent and not filed");
    expect(body.summary).toContain("Decree 43 of 2013, Article 1");
    expect(body.summary).toContain("above that maximum");
    expect(body.summary).toContain("Building: AAA RESIDENCE");
    expect(body.summary).toContain("AED 64,038 to AED 78,268");
    expect(body.summary).toContain(bandText(5).en);
    expect(body.summary).toContain("5 percent (AED 3,000)");
    expect(body.summary).not.toContain("index average");

    const stored = await getStore().lrange(KEYS.drafts, 0, -1);
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0]).case_reference).toBe(body.case_reference);
  });
});

describe("POST /api/tools/prepare-draft in Arabic", () => {
  it("uses DLD's official Arabic names and DLD's Arabic band wording", async () => {
    const hamria = INDEX_ENTRIES.find((e) => e.building === "AL HAMRIA")!;
    const res = await prepareDraft(toolRequest({ ...HAMRIA, current_rent_aed: 70000, language: "ar" }));
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.note).toBe(DRAFT_NOTE.ar);
    for (const text of [hamria.area_ar, hamria.building_ar!, hamria.bedrooms_ar, bandText(10).ar, "81000", "99000", "77000"]) {
      expect(body.summary).toContain(text);
    }
  });

  it("uses the English building name where DLD has no Arabic name", async () => {
    const souq = INDEX_ENTRIES.find((e) => e.building_ar === null)!;
    const res = await prepareDraft(
      toolRequest({ area: souq.area, building: souq.building, bedrooms: souq.bedrooms, current_rent_aed: 52000, language: "ar" }),
    );
    expect((await res.json()).summary).toContain(souq.building);
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

describe("flow events", () => {
  const CONV = "conv_01flowtest0000000001";
  const flowsFor = async (id: string) => {
    const res = await getFlows(new Request(`http://localhost/api/flows/${id}`), {
      params: Promise.resolve({ conversationId: id }),
    } as RouteContext<"/api/flows/[conversationId]">);
    return { status: res.status, body: await res.json() };
  };
  const flowNumbers = async (id: string) => (await flowsFor(id)).body.flows.map((f: { flow: number }) => f.flow);

  it("records flows 3 and 4 for index_lookup, 6 and 7 for prepare_draft, 8 for handover", async () => {
    const intake = { ...AAA, current_rent_aed: 60000, conversation_id: CONV };
    expect((await indexLookup(toolRequest(intake))).status).toBe(200);
    expect(await flowNumbers(CONV)).toEqual([3, 4]);
    expect((await prepareDraft(toolRequest(intake))).status).toBe(200);
    expect((await handover(toolRequest({ reason: "person", summary: "Asked for a person.", conversation_id: CONV }))).status).toBe(200);
    expect(await flowNumbers(CONV)).toEqual([3, 4, 6, 7, 8]);
  });

  it("records flow 9 when a signed post-call webhook reaches the ledger", async () => {
    const id = "conv_01flowtest0000000009";
    await postCall(signedWebhook(postCallEvent(id)));
    expect(await flowNumbers(id)).toEqual([9]);
  });

  it("does not record a flow for a rejected call", async () => {
    const id = "conv_01flowtest0000000401";
    await indexLookup(toolRequest({ ...AAA, current_rent_aed: 60000, conversation_id: id }, "wrong"));
    await postCall(signedWebhook(postCallEvent(id), "other-secret"));
    expect(await flowNumbers(id)).toEqual([]);
  });

  it("returns only flow numbers and timestamps", async () => {
    await indexLookup(toolRequest({ ...AAA, current_rent_aed: 60000, conversation_id: CONV }));
    const { body } = await flowsFor(CONV);
    for (const f of body.flows) expect(Object.keys(f).sort()).toEqual(["at", "flow"]);
  });

  it("rejects an invalid conversation id", async () => {
    expect((await flowsFor("../../haq:ledger")).status).toBe(400);
  });
});
