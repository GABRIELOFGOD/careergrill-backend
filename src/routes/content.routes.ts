import { Router } from "express";
import {
  getPublishedContentBySlug,
  getPublishedContentList,
} from "../controllers/content.controller.js";
import { getContentImageAsset } from "../controllers/content-assets.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/", asyncHandler(getPublishedContentList));
router.get("/assets/:id", asyncHandler(getContentImageAsset));
router.get("/:slug", asyncHandler(getPublishedContentBySlug));

export default router;
