# Marketing Portal — Meta Ads SaaS Backend

Multi-tenant backend for managing Meta (Facebook/Instagram) ad campaigns. Node.js, Express, Prisma (MySQL), Zod, TypeScript.

**"Bring Your Own App" model**: this platform does not have a single platform-wide Meta App. Every user/agency registers their *own* Meta Developer App (App ID + App Secret), and their ad account data is fetched through *their* app — not ours.

## Architecture

```
src/
  config/        env validation, Prisma client singleton
  controllers/   thin HTTP layer — parses req, calls services, shapes response
  services/      business logic, Prisma calls, Meta API calls
  middlewares/   auth (JWT), validation (Zod), global error handler
  routes/        Express routers per resource
  utils/         crypto, AppError, asyncHandler, Zod schemas
  types/         shared/global TypeScript types
prisma/
  schema.prisma  User (with portalUrl), MetaApp, MetaAccount, AdCampaign models
```

Controllers never talk to Prisma or the Meta SDK directly — they call into `services/`. This keeps business logic testable and reusable outside the HTTP layer.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in values:
   - `DATABASE_URL` — MySQL connection string
   - `JWT_SECRET` — `openssl rand -hex 32`
   - `TOKEN_ENCRYPTION_KEY` — `openssl rand -hex 32` (32-byte AES-256-GCM key, hex-encoded)
   - `META_OAUTH_REDIRECT_URI` — your backend's callback URL (see below)
   - `FRONTEND_URL` — fallback redirect target, only used if a client hasn't set their own `portalUrl` yet
3. `npx prisma migrate dev --name init`
4. `npm run dev`

## Tests

`npm test` runs the suite (vitest + supertest). Tests never touch a real database or call Meta — `prisma` is mocked at the module level and env vars are injected by `vitest.config.ts`, so no `.env` is required to run them.

There is **no platform-wide `META_APP_ID`/`META_APP_SECRET`** — those are registered per-user at runtime (see below).

## Each client has their own portal (white-label)

This is white-label: every client (`User`) runs their own portal/frontend on their own domain, not a single shared frontend. So `User.portalUrl` is stored per-client and OAuth callbacks redirect each client back to *their* portal — not one global `FRONTEND_URL`.

- Set on signup: `POST /api/v1/auth/register` accepts an optional `portalUrl`.
- Change later: `PATCH /api/v1/auth/me` with `{ "portalUrl": "https://client-a.example.com" }`.
- If a client hasn't set `portalUrl`, OAuth falls back to the env-level `FRONTEND_URL` (useful for your own testing before any real client portal exists).

## Server-to-server integration (e.g. an external OMS)

If the platform calling this API is itself a system with its own end users (an Order Management
System, an agency tool, etc.) — those end users never need a login here. Instead:

1. The integrating system registers **one** account here (`POST /auth/register`) and **one** Meta App (`POST /meta-apps`).
2. It generates a long-lived API key: `POST /auth/api-key` (requires the JWT from step 1, once). The plaintext key (`mp_<prefix>_<secret>`) is returned exactly once — store it in the integrator's own backend config, not in source control.
3. Every subsequent call uses `X-API-Key: <key>` instead of `Authorization: Bearer <jwt>` — `authMiddleware` (`src/middlewares/auth.middleware.ts`) accepts either. No token expiry to manage; rotate via `POST /auth/api-key` again (invalidates the old key) or `DELETE /auth/api-key` to revoke entirely.
4. When connecting a Meta account *on behalf of one of the integrator's own customers*, pass `?externalCustomerId=<their-customer-id>` to `GET /meta-accounts/oauth/start` — it's threaded through the OAuth `state` and stored on the resulting `MetaAccount.externalCustomerId`. The integrator never has to expose any of this to us beyond an opaque string.
5. `GET /meta-accounts?externalCustomerId=<id>` then returns only that customer's connected accounts — lets the integrator scope every read/write to the right end customer without us knowing anything about their data model.

This means: one platform `User` per integrator (not per their end customer), one API key, `externalCustomerId` as the join key on their side.

## Connecting a user's Meta ad account (OAuth, per-user app)

Users never type their Meta *password* into this platform, but each user (or agency) does need their own Meta Developer App, since Meta data is fetched under that app's identity:

### Step A — user registers their own Meta App once

1. User creates an app at [developers.facebook.com/apps](https://developers.facebook.com/apps) ("Business" type), adds the "Facebook Login for Business" product.
2. In that app's settings, they add `META_OAUTH_REDIRECT_URI` (this backend's callback URL) to "Valid OAuth Redirect URIs".
3. User calls `POST /api/v1/meta-apps` with their `appId` + `appSecret` (+ optional `label`). Before storing anything, the server eagerly verifies the pair against Meta's `client_credentials` grant (`verifyMetaAppCredentials` in `src/services/metaOAuth.service.ts`) — invalid/fake credentials are rejected with a `400` immediately, not silently stored and discovered broken weeks later during OAuth. Once verified, the secret is AES-256-GCM encrypted before being stored — it is never returned in any API response after creation.

### Step B — OAuth dialog (per ad-account connection)

1. `GET /api/v1/meta-accounts/oauth/start?metaAppId=<id>` (authenticated) → server looks up that `MetaApp` row (must belong to the calling user), builds the Meta consent URL using *that app's* `client_id`, and redirects.
2. User logs into Meta (on Meta's own domain) and approves permissions (`ads_management`, `ads_read`, `business_management`).
3. Meta redirects back to `GET /api/v1/meta-accounts/oauth/callback?code=...&state=...`. The server:
   - verifies `state` (a short-lived signed JWT carrying which user + which `MetaApp` initiated the flow — needed because this request has no Authorization header)
   - decrypts that app's secret and exchanges `code` for a short-lived token, then a ~60-day long-lived token
   - fetches every ad account the user authorized (`/me/adaccounts`)
   - encrypts the long-lived token and upserts one `MetaAccount` row per ad account, linked to the originating `MetaApp`
4. Browser is redirected to `<that user's portalUrl>/meta-accounts/connect?status=success&count=N` (or `FRONTEND_URL` if they have no `portalUrl` set).

During this flow we also call `/me` to capture the connecting Facebook user's id (`MetaAccount.facebookUserId`) — needed to match deauthorize webhook events back to the right rows (see below).

## Token expiry & deauthorization handling

Long-lived Meta tokens last ~60 days and users can revoke access at any time from their own Meta settings — both cases are handled so connections don't silently go stale:

- **Expiry check on every Meta API call**: `MetaAccountClient` (`src/services/meta.service.ts`) refuses to run if `tokenExpiresAt` has passed or the row is already `isActive: false`, throwing a clear `401` telling the caller to reconnect — instead of a confusing Meta API failure.
- **Live auth-failure detection**: if Meta itself rejects a call with `OAuthException` code 190 (invalid/expired/revoked token), the account is immediately marked `isActive: false` so subsequent calls fail fast.
- **Deauthorize webhook**: `POST /api/v1/meta-accounts/webhook/deauthorize/:metaAppId` — Meta calls this server-to-server the moment a user removes the app from their Meta account. Each client must set this exact URL (with *their* `MetaApp.id` in the path) as their Meta App's **Deauthorize Callback URL** (App Dashboard → Settings → Basic). The handler:
  1. verifies Meta's `signed_request` using that app's own decrypted secret (HMAC-SHA256, per Meta's documented scheme)
  2. extracts the Facebook `user_id` who revoked access
  3. marks every `MetaAccount` row for that `(metaAppId, facebookUserId)` pair `isActive: false`

## Security notes

- Both Meta App secrets (`MetaApp.appSecretEncrypted`) and ad-account access tokens (`MetaAccount.accessTokenEncrypted`) are AES-256-GCM encrypted at rest (`src/utils/crypto.ts`) — ciphertext, IV, and auth tag stored as separate columns, decrypted only in-memory when needed.
- `metaApp.service.ts` / `metaAccount.service.ts` strip encrypted secret/token fields from every API response.
- All mutating routes require a valid JWT (`authMiddleware`); a user can only start OAuth with, or read, `MetaApp`/`MetaAccount` rows they own.
- The OAuth `state` param is itself a signed JWT (10-minute expiry, single-purpose claim) carrying `userId` + `metaAppId` — it can't be forged or replayed against a different user or app.
- The deauthorize webhook verifies Meta's HMAC signature before trusting any payload — an attacker can't deactivate an arbitrary account without knowing that app's secret.
- `/auth/login` and `/auth/register` are rate-limited (10 req / 15 min per IP) to slow down credential-stuffing; all other routes share a looser global limit (300 req / 15 min).
- CORS only allows: origins in `ALLOWED_ORIGINS`, plus each client's own registered `User.portalUrl` (checked dynamically, cached 60s).
- All errors and request logs go through structured `pino` logging (`src/config/logger.ts`); set `SENTRY_DSN` to additionally forward unhandled exceptions to Sentry — both are no-ops if unconfigured.

## API

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `PATCH /api/v1/auth/me` (update name/portalUrl)
- `POST /api/v1/auth/api-key` (auth required) — generate/rotate this account's server-to-server API key
- `DELETE /api/v1/auth/api-key` (auth required) — revoke the current API key
- `POST /api/v1/meta-apps` — register a user's own Meta App (appId + appSecret)
- `GET /api/v1/meta-apps` — list the user's registered Meta Apps
- `GET /api/v1/meta-accounts/oauth/start?metaAppId=<id>&externalCustomerId=<optional>` (auth required) — begins OAuth under that app, redirects to Meta
- `GET /api/v1/meta-accounts/oauth/callback` (public, called by Meta) — completes OAuth
- `POST /api/v1/meta-accounts/webhook/deauthorize/:metaAppId` (public, called by Meta) — handles access revocation
- `POST /api/v1/meta-accounts`, `GET /api/v1/meta-accounts?externalCustomerId=<optional>` — manual token connect / list (optionally scoped to one integrator customer)
- `POST /api/v1/campaigns`, `GET /api/v1/campaigns`, `GET/PATCH/DELETE /api/v1/campaigns/:id`

All authenticated routes accept either `Authorization: Bearer <jwt>` (human login) or `X-API-Key: <key>` (server-to-server) — see "Server-to-server integration" above.
