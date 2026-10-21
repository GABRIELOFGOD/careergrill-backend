import { Router } from "express";
import { getPublicConfiguration } from "../controllers/public-config.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
router.get("/", asyncHandler(getPublicConfiguration));

export default router;
