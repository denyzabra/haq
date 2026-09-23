import { appendToLedger } from "@/lib/ledger";
import { asObject, buildLedgerEntry, SIGNATURE_HEADER, webhookClient, type Json } from "@/lib/post-call";
import { getStore } from "@/lib/store";

// ElevenLabs post call webhook. Verifies the HMAC, then appends to the hash chained ledger.
export async function POST(request: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "webhook secret not configured" }, { status: 500 });

  const rawBody = await request.text();
  let event: Json;
  try {
    event = asObject(
      await webhookClient().webhooks.constructEvent(rawBody, request.headers.get(SIGNATURE_HEADER) ?? "", secret),
    );
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  if (event.type !== "post_call_transcription") {
    return Response.json({ received: true, ignored: event.type ?? null });
  }

  const record = await appendToLedger(getStore(), buildLedgerEntry(event));
  return Response.json({ received: true, ledger_index: record.index });
}
