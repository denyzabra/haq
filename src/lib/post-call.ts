import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const SIGNATURE_HEADER = "elevenlabs-signature";

export type Json = Record<string, unknown>;

export const asObject = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

// Signature verification only needs the webhook secret, not the API key, but the
// SDK client constructor insists on one.
export function webhookClient(): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || "unused-for-webhook-verification" });
}

function extractToolCalls(transcript: unknown): Array<{ tool_name: unknown; params_as_json: unknown }> {
  if (!Array.isArray(transcript)) return [];
  return transcript.flatMap((turn) => {
    const calls = asObject(turn).tool_calls;
    return Array.isArray(calls)
      ? calls.map((c) => ({ tool_name: asObject(c).tool_name, params_as_json: asObject(c).params_as_json }))
      : [];
  });
}

function dataValue(results: Json, key: string): unknown {
  return asObject(results[key]).value ?? null;
}

export function buildLedgerEntry(event: Json) {
  const data = asObject(event.data);
  const analysis = asObject(data.analysis);
  const dataCollection = asObject(analysis.data_collection_results);
  return {
    type: event.type,
    event_timestamp: event.event_timestamp ?? null,
    received_at: new Date().toISOString(),
    agent_id: data.agent_id ?? null,
    conversation_id: data.conversation_id ?? null,
    transcript_summary: analysis.transcript_summary ?? null,
    call_successful: analysis.call_successful ?? null,
    evaluation_results: analysis.evaluation_criteria_results ?? {},
    data_collection_results: dataCollection,
    tool_calls: extractToolCalls(data.transcript),
    consent: {
      callback_consent: dataValue(dataCollection, "callback_consent"),
      opted_out: dataValue(dataCollection, "opted_out"),
      escalated: dataValue(dataCollection, "escalated"),
      escalation_reason: dataValue(dataCollection, "escalation_reason"),
    },
  };
}
