import { Router } from "express";
import {
  deleteAdminContent,
  getAdminTrash,
  getAdminContent,
  patchAdminContent,
  postAdminContent,
  restoreAdminContent,
} from "../controllers/content.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(getAdminContent));
router.get("/trash", asyncHandler(getAdminTrash));
router.post("/", asyncHandler(postAdminContent));
router.post("/:id/restore", asyncHandler(restoreAdminContent));
router.patch("/:id", asyncHandler(patchAdminContent));
router.delete("/:id", asyncHandler(deleteAdminContent));

export default router;
