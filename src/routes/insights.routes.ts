import { Router } from "express";
import { insights } from "../controllers/insights.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);
router.get("/", insights);

export default router;
