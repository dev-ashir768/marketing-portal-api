import { Router } from "express";
import { register, login, updateMe, createApiKey, deleteApiKey } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { registerSchema, loginSchema, updateProfileSchema } from "../utils/schemas/auth.schema";

const router = Router();

router.post("/register", validate({ body: registerSchema }), register);
router.post("/login", validate({ body: loginSchema }), login);
router.patch("/me", authMiddleware, validate({ body: updateProfileSchema }), updateMe);
router.post("/api-key", authMiddleware, createApiKey);
router.delete("/api-key", authMiddleware, deleteApiKey);

export default router;
