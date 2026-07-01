import { Router } from "express";
import authRoutes from "./auth.routes";
import metaAppRoutes from "./metaApp.routes";
import metaAccountRoutes from "./metaAccount.routes";
import campaignRoutes from "./campaign.routes";
import adSetRoutes from "./adSet.routes";
import adRoutes from "./ad.routes";
import insightsRoutes from "./insights.routes";
import creativeRoutes from "./creative.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/meta-apps", metaAppRoutes);
router.use("/meta-accounts", metaAccountRoutes);
router.use("/campaigns", campaignRoutes);

// Nested: /campaigns/:campaignId/ad-sets
router.use("/campaigns/:campaignId/ad-sets", adSetRoutes);

// Nested: /campaigns/:campaignId/ad-sets/:adSetId/ads
router.use("/campaigns/:campaignId/ad-sets/:adSetId/ads", adRoutes);

// Insights — account, campaign, adset, or ad level
router.use("/insights", insightsRoutes);
router.use("/creatives", creativeRoutes);

export default router;
