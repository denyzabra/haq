import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { consumeSessionAllowance, sessionCaps } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/request-ip";
import { getStore } from "@/lib/store";

const LIMIT_MESSAGES = {
  ip: "You have used the demo sessions available from this connection for now. Please try again in about an hour.",
  daily: "Today's demo sessions have all been used. Please try again tomorrow.",
} as const;

// Only this site's own page may ask for a session token.
function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

// Issues a single use WebRTC conversation token for the private HAQ agent.
// The ElevenLabs API key never leaves the server.
export async function POST(request: Request) {
  if (isCrossSite(request)) return Response.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    console.error("HAQ: ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID is not set");
    return Response.json({ error: "unavailable", message: "The demo is not available right now." }, { status: 503 });
  }

  const limit = await consumeSessionAllowance(getStore(), hashIp(clientIp(request.headers)), sessionCaps());
  if (!limit.ok) {
    return Response.json(
      { limited: limit.limited, message: LIMIT_MESSAGES[limit.limited], retry_after_seconds: limit.retry_after_seconds },
      { status: 429, headers: { "Retry-After": String(limit.retry_after_seconds) } },
    );
  }

  try {
    const client = new ElevenLabsClient({ apiKey });
    const { token } = await client.conversationalAi.conversations.getWebrtcToken({ agentId });
    return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("HAQ: could not get a conversation token", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable", message: "The demo is not available right now." }, { status: 502 });
  }
}
