import { Router } from "express";
import { sync, list, getOne, update, remove } from "../controllers/adSet.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router({ mergeParams: true }); // mergeParams to access :campaignId from parent

router.use(authMiddleware);
router.post("/sync", sync);
router.get("/", list);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
