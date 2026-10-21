import { Router } from "express";
import {
  deleteAdminFaq,
  getAdminFaqs,
  patchAdminFaq,
  postAdminFaq,
} from "../controllers/faqs.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/", asyncHandler(getAdminFaqs));
router.post("/", asyncHandler(postAdminFaq));
router.patch("/:id", asyncHandler(patchAdminFaq));
router.delete("/:id", asyncHandler(deleteAdminFaq));

export default router;
