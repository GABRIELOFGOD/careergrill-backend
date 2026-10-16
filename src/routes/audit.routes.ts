import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createAuditFeedback, deleteAudit, getAuditAvailability, listAudits } from "../controllers/audit.controller.js";
import { asyncHandler, authenticatedAsyncHandler } from "../middleware/async-handler.js";

const router = Router();
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
router.get("/availability", asyncHandler(getAuditAvailability));
router.use(requireAuth);
router.get("/", authenticatedAsyncHandler(listAudits));
router.post("/feedback", aiLimiter, authenticatedAsyncHandler(createAuditFeedback));
router.delete("/:id", authenticatedAsyncHandler(deleteAudit));

export default router;
