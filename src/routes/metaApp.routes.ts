import { Router } from "express";
import { create, list } from "../controllers/metaApp.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createMetaAppSchema } from "../utils/schemas/metaApp.schema";

const router = Router();

router.use(authMiddleware);
router.post("/", validate({ body: createMetaAppSchema }), create);
router.get("/", list);

export default router;
