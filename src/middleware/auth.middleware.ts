import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../config.js";
import { database } from "../database.js";
import { cookieName, verifySession, type Role } from "../services/auth.service.js";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthRequest extends Request {
  user?: SessionUser;
}

const sessionSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
});

export function requireAuth(request: AuthRequest, _response: Response, next: NextFunction): void {
  try {
    const cookieHeader = request.headers.cookie ?? "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!token) throw new HttpError(401, "Sign in to continue.", "AUTH_REQUIRED");
    const parsed = sessionSchema.safeParse(verifySession(token));
    if (!parsed.success) throw new HttpError(401, "Your session is invalid.", "SESSION_INVALID");
    request.user = parsed.data;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Your session has expired.", "SESSION_EXPIRED"));
  }
}

export function requireAdmin(request: AuthRequest, _response: Response, next: NextFunction): void {
  const user = request.user;
  if (!user) {
    next(new HttpError(401, "Sign in to continue.", "AUTH_REQUIRED"));
    return;
  }
  void database().from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        next(new HttpError(500, "Could not verify administrator access.", "AUTHORIZATION_FAILED"));
        return;
      }
      if (!data) {
        next(new HttpError(401, "Your account could not be verified.", "SESSION_EXPIRED"));
        return;
      }
      if (data.role !== "admin") {
        next(new HttpError(403, "Administrator access is required.", "ADMIN_REQUIRED"));
        return;
      }
      next();
    }, () => {
      next(new HttpError(500, "Could not verify administrator access.", "AUTHORIZATION_FAILED"));
    });
}
