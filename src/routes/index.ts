import { Router } from "express";
import authRoutes from "./auth.routes";
import metaAppRoutes from "./metaApp.routes";
import metaAccountRoutes from "./metaAccount.routes";
import campaignRoutes from "./campaign.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/meta-apps", metaAppRoutes);
router.use("/meta-accounts", metaAccountRoutes);
router.use("/campaigns", campaignRoutes);

export default router;
