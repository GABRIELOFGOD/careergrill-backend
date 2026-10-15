import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  bootstrapAdmin,
  getCurrentUser,
  googleCallback,
  login,
  logout,
  register,
  resendVerification,
  startGoogleLogin,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler, authenticatedAsyncHandler } from "../middleware/async-handler.js";

const router = Router();
export const bootstrapRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false });

router.post("/register", authLimiter, asyncHandler(register));
router.post("/verify-email", authLimiter, asyncHandler(verifyEmail));
router.post("/resend-verification", authLimiter, requireAuth, authenticatedAsyncHandler(resendVerification));
router.post("/login", authLimiter, asyncHandler(login));
router.get("/google", authLimiter, startGoogleLogin);
router.get("/google/callback", authLimiter, asyncHandler(googleCallback));
router.post("/logout", logout);
router.get("/me", requireAuth, authenticatedAsyncHandler(getCurrentUser));
bootstrapRouter.post("/", authLimiter, asyncHandler(bootstrapAdmin));

export default router;
