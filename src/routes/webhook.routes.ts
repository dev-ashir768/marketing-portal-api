import { Router } from "express";
import { verifyWebhook, receiveWebhook } from "../controllers/webhook.controller";

const router = Router();

// Meta calls GET to verify the endpoint subscription
router.get("/meta", verifyWebhook);

// Meta calls POST to deliver real-time events
router.post("/meta", receiveWebhook);

export default router;
