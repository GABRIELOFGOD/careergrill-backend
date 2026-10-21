import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  getPublishedContentBySlug,
  getPublishedContentList,
  getPublishedTestimonials,
  postClientFeedback,
} from "../controllers/content.controller.js";
import { getContentImageAsset } from "../controllers/content-assets.controller.js";
import { downloadPublicResourceAttachment, listPublicResourceAttachments } from "../controllers/resource-assets.controller.js";
import { getPublishedFaqs } from "../controllers/faqs.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
const feedbackLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });

router.get("/", asyncHandler(getPublishedContentList));
router.get("/testimonials", asyncHandler(getPublishedTestimonials));
router.post("/testimonials", feedbackLimiter, asyncHandler(postClientFeedback));
router.get("/faqs", asyncHandler(getPublishedFaqs));
router.get("/assets/:id", asyncHandler(getContentImageAsset));
router.get("/resources/:slug/attachments", asyncHandler(listPublicResourceAttachments));
router.get("/resources/:slug/attachments/:attachmentId/download", asyncHandler(downloadPublicResourceAttachment));
router.get("/:slug", asyncHandler(getPublishedContentBySlug));

export default router;
