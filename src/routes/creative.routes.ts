import { Router } from "express";
import multer from "multer";
import { upload, list, getOne, remove, attach } from "../controllers/creative.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Store file in memory (buffer) — we stream directly to Meta, no disk needed
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/mov", "video/quicktime", "video/avi"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WEBP, MP4, MOV, AVI`));
    }
  },
});

router.use(authMiddleware);
router.post("/upload", multerUpload.single("file"), upload);
router.get("/", list);
router.get("/:id", getOne);
router.delete("/:id", remove);
router.post("/:id/attach", attach);

export default router;
