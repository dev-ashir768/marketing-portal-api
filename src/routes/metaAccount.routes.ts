import { Router } from "express";
import {
  connect,
  list,
  startOAuth,
  oauthCallback,
  deauthorizeWebhook,
} from "../controllers/metaAccount.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { connectMetaAccountSchema } from "../utils/schemas/metaAccount.schema";

const router = Router();

// Public: Meta redirects the user's browser here directly, no Authorization header present.
// Identity is recovered from the signed `state` param (see metaOAuth.service.ts).
router.get("/oauth/callback", oauthCallback);

// Public: Meta calls this server-to-server when a user revokes access on their end.
// :metaAppId in the path identifies which app's secret to verify the signature with.
router.post("/webhook/deauthorize/:metaAppId", deauthorizeWebhook);

router.use(authMiddleware);
router.get("/oauth/start", startOAuth);
router.post("/", validate({ body: connectMetaAccountSchema }), connect);
router.get("/", list);

export default router;
