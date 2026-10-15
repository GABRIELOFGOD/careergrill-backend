import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { config, HttpError } from "../config.js";

export type Role = "admin" | "user";
export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

const cookieName = "careergrill_session";
const sessionAgeSeconds = 60 * 60 * 8;

function jwtSecret(): string {
  if (!config.JWT_SECRET) throw new HttpError(503, "JWT signing is not configured.", "SETUP_REQUIRED");
  return config.JWT_SECRET;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createSession(user: SessionUser, response: Response): void {
  const token = jwt.sign(user, jwtSecret(), { expiresIn: sessionAgeSeconds });
  response.cookie(cookieName, token, {
    httpOnly: true,
    secure: config.NODE_ENV !== "development",
    sameSite: config.NODE_ENV === "development" ? "lax" : "none",
    path: "/",
    maxAge: sessionAgeSeconds * 1000,
  });
}

export function clearSession(response: Response): void {
  response.clearCookie(cookieName, {
    httpOnly: true,
    secure: config.NODE_ENV !== "development",
    sameSite: config.NODE_ENV === "development" ? "lax" : "none",
    path: "/",
  });
}

export function verifySession(token: string): string | jwt.JwtPayload {
  return jwt.verify(token, jwtSecret());
}

export { cookieName };
