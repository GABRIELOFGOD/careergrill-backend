import { Router } from "express";
import {
  deleteAdminContent,
  getAdminContent,
  patchAdminContent,
  postAdminContent,
} from "../controllers/content.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(getAdminContent));
router.post("/", asyncHandler(postAdminContent));
router.patch("/:id", asyncHandler(patchAdminContent));
router.delete("/:id", asyncHandler(deleteAdminContent));

export default router;
