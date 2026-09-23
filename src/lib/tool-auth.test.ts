import { describe, expect, it } from "vitest";
import { isAuthorizedToolCall, TOOL_SECRET_HEADER } from "./tool-auth";

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/tools/x", { method: "POST", headers });

describe("isAuthorizedToolCall", () => {
  it("accepts the matching secret", () => {
    expect(isAuthorizedToolCall(req({ [TOOL_SECRET_HEADER]: "s3cret" }), "s3cret")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isAuthorizedToolCall(req({ [TOOL_SECRET_HEADER]: "nope" }), "s3cret")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedToolCall(req(), "s3cret")).toBe(false);
  });

  it("rejects everything when the server secret is not configured", () => {
    expect(isAuthorizedToolCall(req({ [TOOL_SECRET_HEADER]: "" }), undefined)).toBe(false);
    expect(isAuthorizedToolCall(req({ [TOOL_SECRET_HEADER]: "anything" }), "")).toBe(false);
  });
});
