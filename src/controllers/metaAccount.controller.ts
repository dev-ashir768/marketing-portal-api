import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  connectMetaAccount,
  listMetaAccounts,
  persistMetaAccountsFromOAuth,
  deactivateMetaAccountsForFacebookUser,
} from "../services/metaAccount.service";
import { getOwnedMetaApp, getMetaAppById, decryptMetaAppSecret } from "../services/metaApp.service";
import {
  createOAuthState,
  verifyOAuthState,
  buildMetaAuthorizationUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchAuthorizedAdAccounts,
  fetchMetaUserId,
  verifySignedRequest,
} from "../services/metaOAuth.service";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

export const connect = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const account = await connectMetaAccount(req.user.id, req.body);
  res.status(201).json({ success: true, data: account });
});

// `?externalCustomerId=` lets a server-to-server integrator (calling with their
// own API key, on behalf of one of *their* customers) filter to just that customer's accounts.
export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const externalCustomerId = typeof req.query.externalCustomerId === "string" ? req.query.externalCustomerId : undefined;
  const accounts = await listMetaAccounts(req.user.id, externalCustomerId);
  res.status(200).json({ success: true, data: accounts });
});

// Step 1: redirect to Meta's consent dialog, using the credentials of the Meta
// App *the calling account* registered (?metaAppId=...) — never a platform-wide
// app. `?externalCustomerId=` is optional and only meaningful for server-to-server
// integrators (e.g. an OMS) connecting a Meta account on behalf of one of their
// own end customers — it's threaded through so the resulting MetaAccount rows
// can be filtered back to that customer later. The user id + chosen app (+
// customer ref) travel in a short-lived signed `state` param since the callback
// below is hit directly by Meta with no Authorization header.
export const startOAuth = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const metaAppId = req.query.metaAppId;
  if (typeof metaAppId !== "string") {
    throw new AppError("metaAppId query param is required", 400);
  }
  const externalCustomerId = typeof req.query.externalCustomerId === "string" ? req.query.externalCustomerId : undefined;

  const metaApp = await getOwnedMetaApp(req.user.id, metaAppId);
  const state = createOAuthState(req.user.id, metaApp.id, externalCustomerId);
  const url = buildMetaAuthorizationUrl(metaApp.appId, state);
  res.status(200).json({ success: true, data: { url } });
});

// Each client is white-labeled with their own portal, so redirects must land
// on *that* user's portalUrl rather than one platform-wide frontend. Falls
// back to env.FRONTEND_URL if the user hasn't set a portal yet.
async function resolvePortalBaseUrl(userId: string | undefined): Promise<string> {
  if (!userId) return env.FRONTEND_URL;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { portalUrl: true } });
  return user?.portalUrl || env.FRONTEND_URL;
}

// Step 2: Meta redirects back here with ?code & ?state after the user approves.
// We never see the user's Meta password — Meta handles login on its own domain
// and hands us a one-time `code`, which we exchange server-side (using the
// originating user's own App ID/Secret) for a token.
export const oauthCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error: metaError } = req.query;

  // Meta echoes `state` back even on a denial, so we can still recover which
  // user's portal to bounce back to.
  const stateUserId = typeof state === "string" ? safeVerifyState(state)?.userId : undefined;

  if (metaError) {
    const portalUrl = await resolvePortalBaseUrl(stateUserId);
    return res.redirect(`${portalUrl}/meta-accounts/connect?status=error&reason=denied`);
  }
  if (typeof code !== "string" || typeof state !== "string") {
    throw new AppError("Missing code or state from Meta callback", 400);
  }

  const { userId, metaAppId, externalCustomerId } = verifyOAuthState(state);
  const portalUrl = await resolvePortalBaseUrl(userId);

  const metaApp = await getOwnedMetaApp(userId, metaAppId);
  const appSecret = decryptMetaAppSecret(metaApp);

  const shortLivedToken = await exchangeCodeForShortLivedToken(metaApp.appId, appSecret, code);
  const { accessToken, expiresInSeconds } = await exchangeForLongLivedToken(
    metaApp.appId,
    appSecret,
    shortLivedToken
  );
  const [adAccounts, facebookUserId] = await Promise.all([
    fetchAuthorizedAdAccounts(accessToken),
    fetchMetaUserId(accessToken),
  ]);

  if (adAccounts.length === 0) {
    return res.redirect(`${portalUrl}/meta-accounts/connect?status=error&reason=no_ad_accounts`);
  }

  await persistMetaAccountsFromOAuth(
    userId,
    metaApp.id,
    facebookUserId,
    adAccounts,
    accessToken,
    expiresInSeconds,
    externalCustomerId
  );

  res.redirect(`${portalUrl}/meta-accounts/connect?status=success&count=${adAccounts.length}`);
});

// Meta calls this when a Facebook user revokes the app's access from their own
// Meta settings (not initiated by us). Each client must set this exact URL as
// their Meta App's "Deauthorize Callback URL" in App Dashboard → Settings → Basic.
// The :metaAppId in the path tells us which app's secret to verify the
// signed_request against — Meta's POST body carries no other identifying info.
export const deauthorizeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { metaAppId } = req.params;
  const signedRequest = req.body?.signed_request;

  if (typeof signedRequest !== "string") {
    throw new AppError("Missing signed_request", 400);
  }

  const metaApp = await getMetaAppById(metaAppId);
  const appSecret = decryptMetaAppSecret(metaApp);

  const payload = verifySignedRequest(signedRequest, appSecret);
  if (!payload) {
    throw new AppError("Invalid signed_request signature", 400);
  }

  const count = await deactivateMetaAccountsForFacebookUser(metaApp.id, payload.user_id);
  logger.info({ metaAppId, facebookUserId: payload.user_id, count }, "Deactivated accounts via deauthorize webhook");

  // Meta expects a 200 with this JSON shape to confirm receipt.
  res.status(200).json({ url: env.FRONTEND_URL, confirmation_code: payload.user_id });
});

function safeVerifyState(state: string): { userId: string; metaAppId: string } | undefined {
  try {
    return verifyOAuthState(state);
  } catch {
    return undefined;
  }
}
