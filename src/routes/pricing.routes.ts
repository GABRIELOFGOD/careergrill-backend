import { Router } from "express";
import { getPublicPricing } from "../controllers/pricing.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/", asyncHandler(getPublicPricing));

export default router;
