import { beforeEach, describe, expect, it, vi } from "vitest";

const getWebrtcToken = vi.fn();
vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = { conversations: { getWebrtcToken } };
  },
}));

const { POST } = await import("../conversation-token/route");
const { resetStoreForTests } = await import("@/lib/store");

function tokenRequest(ip = "203.0.113.7", headers: Record<string, string> = {}) {
  return new Request("https://haq.example/api/conversation-token", {
    method: "POST",
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, "sec-fetch-site": "same-origin", ...headers },
  });
}

beforeEach(() => {
  for (const n of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "VERCEL"]) delete process.env[n];
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_AGENT_ID = "agent_test";
  process.env.HAQ_IP_HOURLY_CAP = "3";
  process.env.HAQ_DAILY_SESSION_CAP = "5";
  resetStoreForTests();
  getWebrtcToken.mockReset();
  getWebrtcToken.mockResolvedValue({ token: "tok_123", conversationId: "conv_x" });
});

describe("POST /api/conversation-token", () => {
  it("returns only the token for the configured agent", async () => {
    const res = await POST(tokenRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "tok_123" });
    expect(getWebrtcToken).toHaveBeenCalledWith({ agentId: "agent_test" });
  });

  it("limits each IP to 3 sessions per hour with a friendly message", async () => {
    for (let i = 0; i < 3; i++) expect((await POST(tokenRequest())).status).toBe(200);
    const res = await POST(tokenRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.limited).toBe("ip");
    expect(body.message).toContain("try again");
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(getWebrtcToken).toHaveBeenCalledTimes(3);
  });

  it("applies the daily cap across IPs", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(tokenRequest(`198.51.100.${i}`))).status).toBe(200);
    const res = await POST(tokenRequest("198.51.100.99"));
    expect(res.status).toBe(429);
    expect((await res.json()).limited).toBe("daily");
  });

  it("rejects cross site requests", async () => {
    expect((await POST(tokenRequest(undefined, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(tokenRequest(undefined, { "sec-fetch-site": "", origin: "https://evil.example" }))).status).toBe(403);
    expect(getWebrtcToken).not.toHaveBeenCalled();
  });

  it("returns 503 when not configured and 502 when ElevenLabs fails, without details", async () => {
    delete process.env.ELEVENLABS_AGENT_ID;
    expect((await POST(tokenRequest())).status).toBe(503);
    process.env.ELEVENLABS_AGENT_ID = "agent_test";
    getWebrtcToken.mockRejectedValueOnce(new Error("upstream secret detail"));
    const res = await POST(tokenRequest("192.0.2.50"));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
