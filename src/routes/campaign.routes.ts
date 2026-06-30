import { Router } from "express";
import { create, list, getOne, update, remove } from "../controllers/campaign.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
} from "../utils/schemas/campaign.schema";

const router = Router();

router.use(authMiddleware);
router.post("/", validate({ body: createCampaignSchema }), create);
router.get("/", list);
router.get("/:id", validate({ params: campaignIdParamSchema }), getOne);
router.patch("/:id", validate({ params: campaignIdParamSchema, body: updateCampaignSchema }), update);
router.delete("/:id", validate({ params: campaignIdParamSchema }), remove);

export default router;
