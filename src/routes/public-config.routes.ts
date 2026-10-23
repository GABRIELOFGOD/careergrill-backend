import { Router } from "express";
import {
  getPublicAnalyticsConfig,
  getPublicConsultationServices,
  getPublicPricingCopy,
} from "../controllers/public-config.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
router.get("/analytics", asyncHandler(getPublicAnalyticsConfig));
router.get("/pricing-copy", asyncHandler(getPublicPricingCopy));
router.get("/consultation", asyncHandler(getPublicConsultationServices));

export default router;
