import { Router } from "express";
import multer from "multer";
import {
  deleteResourceAttachment,
  listAdminResourceAttachments,
  uploadResourceAttachment,
} from "../controllers/resource-assets.controller.js";
import {
  deleteAdminContent,
  getAdminTrash,
  getAdminContent,
  patchAdminContent,
  postAdminContent,
  restoreAdminContent,
} from "../controllers/content.controller.js";
import { asyncHandler, authenticatedAsyncHandler } from "../middleware/async-handler.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
const resourceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(getAdminContent));
router.get("/trash", asyncHandler(getAdminTrash));
router.get("/resources/:id/attachments", authenticatedAsyncHandler(listAdminResourceAttachments));
router.post("/resources/:id/attachments", resourceUpload.single("file"), authenticatedAsyncHandler(uploadResourceAttachment));
router.delete("/resources/:id/attachments/:attachmentId", authenticatedAsyncHandler(deleteResourceAttachment));
router.post("/", asyncHandler(postAdminContent));
router.post("/:id/restore", asyncHandler(restoreAdminContent));
router.patch("/:id", asyncHandler(patchAdminContent));
router.delete("/:id", asyncHandler(deleteAdminContent));

export default router;
