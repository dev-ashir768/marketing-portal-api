import crypto from "crypto";
import { describe, it, expect } from "vitest";
import {
  createOAuthState,
  verifyOAuthState,
  verifySignedRequest,
} from "../../src/services/metaOAuth.service";

function buildSignedRequest(payload: Record<string, unknown>, appSecret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest("base64url");
  return `${sig}.${encodedPayload}`;
}

describe("metaOAuth.service", () => {
  describe("OAuth state (signed JWT carrying userId + metaAppId)", () => {
    it("round-trips userId and metaAppId through create/verify", () => {
      const state = createOAuthState("user-123", "app-456");
      const result = verifyOAuthState(state);

      expect(result).toEqual({ userId: "user-123", metaAppId: "app-456" });
    });

    it("rejects a garbage state value", () => {
      expect(() => verifyOAuthState("not-a-real-jwt")).toThrow();
    });
  });

  describe("verifySignedRequest (Meta deauthorize webhook signature)", () => {
    const appSecret = "super-secret-app-secret";

    it("accepts a correctly signed payload and returns it", () => {
      const payload = { user_id: "fb-user-1", algorithm: "HMAC-SHA256", issued_at: 1700000000 };
      const signedRequest = buildSignedRequest(payload, appSecret);

      expect(verifySignedRequest(signedRequest, appSecret)).toEqual(payload);
    });

    it("rejects a payload signed with the wrong app secret", () => {
      const payload = { user_id: "fb-user-1", algorithm: "HMAC-SHA256", issued_at: 1700000000 };
      const signedRequest = buildSignedRequest(payload, "a-different-secret");

      expect(verifySignedRequest(signedRequest, appSecret)).toBeNull();
    });

    it("rejects a malformed signed_request with no '.' separator", () => {
      expect(verifySignedRequest("not-a-signed-request", appSecret)).toBeNull();
    });

    it("rejects a tampered payload (signature no longer matches)", () => {
      const payload = { user_id: "fb-user-1", algorithm: "HMAC-SHA256", issued_at: 1700000000 };
      const [sig] = buildSignedRequest(payload, appSecret).split(".");
      const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, user_id: "fb-attacker" })).toString(
        "base64url"
      );

      expect(verifySignedRequest(`${sig}.${tamperedPayload}`, appSecret)).toBeNull();
    });
  });
});
