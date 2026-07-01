import { Router } from "express";
import { list } from "../controllers/auditLog.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();
router.use(authMiddleware);
router.get("/", list);

export default router;
