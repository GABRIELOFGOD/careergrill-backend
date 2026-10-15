import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import {
  deleteReferenceDocument,
  generateDraft,
  getOverview,
  getSettings,
  listReferenceDocuments,
  updateSettings,
  uploadReferenceDocument,
} from "../controllers/admin.controller.js";
import { uploadContentImageAsset } from "../controllers/content-assets.controller.js";
import { authenticatedAsyncHandler } from "../middleware/async-handler.js";

const router = Router();
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

router.use(requireAuth, requireAdmin);
router.get("/overview", authenticatedAsyncHandler(getOverview));
router.get("/settings", authenticatedAsyncHandler(getSettings));
router.put("/settings", authenticatedAsyncHandler(updateSettings));
router.post("/ai/generate", aiLimiter, authenticatedAsyncHandler(generateDraft));
router.get("/files", authenticatedAsyncHandler(listReferenceDocuments));
router.post("/files", upload.single("file"), authenticatedAsyncHandler(uploadReferenceDocument));
router.delete("/files/:id", authenticatedAsyncHandler(deleteReferenceDocument));
router.post("/assets/images", upload.single("file"), authenticatedAsyncHandler(uploadContentImageAsset));

export default router;
