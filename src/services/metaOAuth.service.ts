import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_API_VERSION}`;
const DIALOG_BASE = `https://www.facebook.com/${env.META_API_VERSION}/dialog/oauth`;

// Minimal scope needed to read/manage ad accounts and campaigns.
const OAUTH_SCOPES = ["ads_management", "ads_read", "business_management"];

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface MetaAdAccountSummary {
  id: string; // e.g. "act_123456789"
  name: string;
}

interface OAuthStatePayload {
  sub: string; // platform userId
  metaAppId: string; // which of the user's registered MetaApp rows this flow uses
  purpose: "meta_oauth";
}

// Signs the requesting user's id + chosen MetaApp into the OAuth `state` param so the
// callback (which Meta calls directly, with no Authorization header) can identify both.
// Short-lived (10 min) to limit the window if a state value leaks.
export function createOAuthState(userId: string, metaAppId: string): string {
  const payload: OAuthStatePayload = { sub: userId, metaAppId, purpose: "meta_oauth" };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState(state: string): { userId: string; metaAppId: string } {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as OAuthStatePayload;
    if (payload.purpose !== "meta_oauth") {
      throw new Error("wrong purpose");
    }
    return { userId: payload.sub, metaAppId: payload.metaAppId };
  } catch {
    throw new AppError("Invalid or expired OAuth state", 400);
  }
}

// `appId` is the user's own Meta Developer App ID (from their registered MetaApp row),
// not a platform-wide credential.
export function buildMetaAuthorizationUrl(appId: string, state: string): string {
  const url = new URL(DIALOG_BASE);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeCodeForShortLivedToken(
  appId: string,
  appSecret: string,
  code: string
): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new AppError("Failed to exchange authorization code with Meta", 502, await safeJson(res));
  }
  const data = (await res.json()) as MetaTokenResponse;
  return data.access_token;
}

// Exchanges a short-lived user token for a long-lived one (~60 days) so we
// don't have to re-run the OAuth dance on every login.
export async function exchangeForLongLivedToken(
  appId: string,
  appSecret: string,
  shortLivedToken: string
): Promise<{ accessToken: string; expiresInSeconds?: number }> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new AppError("Failed to obtain long-lived Meta token", 502, await safeJson(res));
  }
  const data = (await res.json()) as MetaTokenResponse;
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

// Eagerly checks that an appId/appSecret pair is real, before we ever store it.
// Uses Meta's "app access token" client_credentials grant — the only Graph API
// call that validates an App ID + Secret without needing a redirect_uri or a
// logged-in Facebook user. Returns false (never throws) so callers can turn
// this into a clean validation error rather than a generic 500.
export async function verifyMetaAppCredentials(appId: string, appSecret: string): Promise<boolean> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("grant_type", "client_credentials");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string };
    return !!data.access_token;
  } catch {
    return false;
  }
}

export async function fetchAuthorizedAdAccounts(accessToken: string): Promise<MetaAdAccountSummary[]> {
  const url = new URL(`${GRAPH_BASE}/me/adaccounts`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new AppError("Failed to fetch ad accounts from Meta", 502, await safeJson(res));
  }
  const data = (await res.json()) as { data: MetaAdAccountSummary[] };
  return data.data;
}

// Records *which* Meta/Facebook person authorized the connection, so a later
// deauthorize webhook (keyed on Meta's user_id) can be matched back to the
// right MetaAccount rows.
export async function fetchMetaUserId(accessToken: string): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new AppError("Failed to fetch Meta user id", 502, await safeJson(res));
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

interface DeauthorizePayload {
  user_id: string;
  algorithm: string;
  issued_at: number;
}

// Verifies Meta's `signed_request` (sent to the per-app Deauthorize Callback URL)
// using that Meta App's own secret, per Meta's documented HMAC-SHA256 scheme.
// Returns the Facebook user_id who revoked access, or null if the signature is invalid.
export function verifySignedRequest(signedRequest: string, appSecret: string): DeauthorizePayload | null {
  const [encodedSig, encodedPayload] = signedRequest.split(".");
  if (!encodedSig || !encodedPayload) return null;

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest("base64url");

  const sigBuf = Buffer.from(encodedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as DeauthorizePayload;
  if (payload.algorithm !== "HMAC-SHA256") return null;

  return payload;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
