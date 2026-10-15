import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  deleteSavedContent,
  listSavedContent,
  saveContent,
  updateSavedContent,
} from "../controllers/saved-content.controller.js";
import { authenticatedAsyncHandler } from "../middleware/async-handler.js";

const router = Router();
router.use(requireAuth);
router.get("/", authenticatedAsyncHandler(listSavedContent));
router.post("/", authenticatedAsyncHandler(saveContent));
router.patch("/:id", authenticatedAsyncHandler(updateSavedContent));
router.delete("/:id", authenticatedAsyncHandler(deleteSavedContent));

export default router;
