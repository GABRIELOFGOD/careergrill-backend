import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { config, HttpError } from "../config.js";
import { clearSession, createSession, hashPassword, verifyPassword } from "../services/auth.service.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { database } from "../database.js";
import { sendEmailVerification } from "../services/mailer.service.js";
import {
  findOrCreateGoogleUser,
  getGoogleAuthorizationUrl,
  isGoogleAuthConfigured,
  verifyGoogleAuthorizationCode,
} from "../services/google-auth.service.js";

const passwordSchema = z.string().min(12).max(128).refine(
  (password) => Buffer.byteLength(password, "utf8") <= 72,
  "Password must be no more than 72 UTF-8 bytes.",
);
const googleStateCookie = "careergrill_google_oauth";
const googleStateCookiePath = "/api/auth/google/callback";

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function clearGoogleStateCookie(response: Response): void {
  response.clearCookie(googleStateCookie, {
    httpOnly: true,
    secure: config.NODE_ENV !== "development",
    sameSite: "lax",
    path: googleStateCookiePath,
  });
}

function redirectGoogleResult(response: Response, result: string): void {
  clearGoogleStateCookie(response);
  const destination = new URL("/signin", config.FRONTEND_URL);
  destination.searchParams.set("auth_error", result);
  response.redirect(303, destination.toString());
}

function requestCookie(request: Request, name: string): string | undefined {
  return request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function startGoogleLogin(_request: Request, response: Response): void {
  if (!isGoogleAuthConfigured()) {
    redirectGoogleResult(response, "google_not_configured");
    return;
  }
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  response.cookie(googleStateCookie, `${state}.${nonce}`, {
    httpOnly: true,
    secure: config.NODE_ENV !== "development",
    sameSite: "lax",
    path: googleStateCookiePath,
    maxAge: 10 * 60 * 1000,
  });
  response.redirect(getGoogleAuthorizationUrl(state, nonce));
}

export async function googleCallback(request: Request, response: Response): Promise<void> {
  const providerError = request.query.error;
  if (providerError) {
    redirectGoogleResult(response, providerError === "access_denied" ? "google_cancelled" : "google_failed");
    return;
  }

  const code = typeof request.query.code === "string" ? request.query.code : "";
  const state = typeof request.query.state === "string" ? request.query.state : "";
  const [storedState, nonce] = (requestCookie(request, googleStateCookie) ?? "").split(".");
  if (!code || !state || !storedState || !nonce || !equalSecret(state, storedState)) {
    redirectGoogleResult(response, "google_state_invalid");
    return;
  }

  try {
    const identity = await verifyGoogleAuthorizationCode(code, nonce);
    const user = await findOrCreateGoogleUser(identity);
    createSession(user, response);
    clearGoogleStateCookie(response);
    response.redirect(303, new URL("/workspace", config.FRONTEND_URL).toString());
  } catch (error) {
    console.error("Google sign-in failed:", error);
    const result = error instanceof HttpError && error.code === "GOOGLE_ACCOUNT_UNVERIFIED"
      ? "google_account_unverified"
      : "google_failed";
    redirectGoogleResult(response, result);
  }
}

export async function register(request: Request, response: Response): Promise<void> {
  const input = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: passwordSchema,
  }).parse(request.body);
  const email = input.email.toLowerCase();
  const { data, error } = await database().from("users")
    .insert({ name: input.name, email, password_hash: await hashPassword(input.password), role: "user" })
    .select("id, email, role")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "An account already exists for this email.", "EMAIL_IN_USE");
  if (error) throw new HttpError(500, "Could not create your account.", "ACCOUNT_CREATE_FAILED");
  createSession({ id: data.id, email: data.email, role: data.role }, response);
  const token = randomBytes(32).toString("hex");
  const { error: tokenError } = await database().from("email_verification_tokens").insert({
    user_id: data.id,
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (tokenError) throw new HttpError(500, "Your account was created, but a verification request could not be saved.", "VERIFICATION_SETUP_FAILED");
  try {
    await sendEmailVerification(data.email, token);
  } catch {
    throw new HttpError(503, "Your account was created, but email delivery is unavailable. Contact an administrator to verify your address.", "EMAIL_DELIVERY_UNAVAILABLE");
  }
  response.status(201).json({ user: { id: data.id, name: input.name, email: data.email, role: data.role, email_verified: false } });
}

export async function verifyEmail(request: Request, response: Response): Promise<void> {
  const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.body);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: verification, error } = await database().from("email_verification_tokens")
    .select("user_id, expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw new HttpError(500, "Could not verify this email address.", "VERIFICATION_FAILED");
  if (!verification || new Date(verification.expires_at) <= new Date()) {
    throw new HttpError(400, "This verification link has expired or has already been used.", "VERIFICATION_EXPIRED");
  }
  const { error: userError } = await database().from("users")
    .update({ email_verified_at: new Date().toISOString() }).eq("id", verification.user_id);
  if (userError) throw new HttpError(500, "Could not verify this email address.", "VERIFICATION_FAILED");
  const { error: tokenDeleteError } = await database().from("email_verification_tokens").delete().eq("user_id", verification.user_id);
  if (tokenDeleteError) throw new HttpError(500, "Your address was verified, but the temporary token could not be removed.", "VERIFICATION_CLEANUP_FAILED");
  response.json({ verified: true });
}

export async function resendVerification(request: AuthRequest, response: Response): Promise<void> {
  const { data: user, error: userError } = await database().from("users")
    .select("id, email, email_verified_at").eq("id", request.user!.id).single();
  if (userError) throw new HttpError(500, "Could not load your account.", "USER_READ_FAILED");
  if (user.email_verified_at) throw new HttpError(409, "Your email address is already verified.", "EMAIL_ALREADY_VERIFIED");
  const token = randomBytes(32).toString("hex");
  const { error } = await database().from("email_verification_tokens").upsert({
    user_id: user.id,
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw new HttpError(500, "Could not prepare a verification link.", "VERIFICATION_SETUP_FAILED");
  try {
    await sendEmailVerification(user.email, token);
  } catch {
    throw new HttpError(503, "Email delivery is unavailable. Try again later or contact support.", "EMAIL_DELIVERY_UNAVAILABLE");
  }
  response.json({ sent: true });
}

export async function login(request: Request, response: Response): Promise<void> {
  const input = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).parse(request.body);
  const { data, error } = await database().from("users")
    .select("id, name, email, password_hash, role").eq("email", input.email.toLowerCase()).maybeSingle();
  if (error) throw new HttpError(500, "Could not sign in. Please try again.", "LOGIN_FAILED");
  if (!data?.password_hash || !(await verifyPassword(input.password, data.password_hash))) {
    throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  }
  createSession({ id: data.id, email: data.email, role: data.role }, response);
  response.json({ user: { id: data.id, name: data.name, email: data.email, role: data.role } });
}

export function logout(_request: Request, response: Response): void {
  clearSession(response);
  response.status(204).end();
}

export async function getCurrentUser(request: AuthRequest, response: Response): Promise<void> {
  const { data, error } = await database().from("users")
    .select("id, name, email, role, email_verified_at").eq("id", request.user!.id).single();
  if (error || !data) throw new HttpError(401, "Your account could not be verified.", "SESSION_EXPIRED");
  const { email_verified_at, ...user } = data;
  response.json({ user: { ...user, email_verified: Boolean(email_verified_at) } });
}

export async function bootstrapAdmin(request: Request, response: Response): Promise<void> {
  const input = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: passwordSchema,
  }).parse(request.body);
  const expected = config.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected) throw new HttpError(503, "Admin bootstrap token is not configured.", "SETUP_REQUIRED");
  const supplied = request.get("x-bootstrap-token") ?? "";
  const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) throw new HttpError(403, "The administrator setup token is invalid.", "BOOTSTRAP_DENIED");
  const { data, error } = await database().rpc("create_first_admin", {
    p_name: input.name,
    p_email: input.email.toLowerCase(),
    p_password_hash: await hashPassword(input.password),
  });
  if (error?.message.includes("BOOTSTRAP_COMPLETE")) {
    throw new HttpError(409, "An administrator account has already been created.", "BOOTSTRAP_COMPLETE");
  }
  if (error) throw new HttpError(500, "Could not create the administrator account.", "BOOTSTRAP_FAILED");
  const firstAdmin = Array.isArray(data) ? data[0] : data;
  if (!firstAdmin) throw new HttpError(500, "The administrator account could not be verified.", "BOOTSTRAP_FAILED");
  createSession({ id: firstAdmin.id, email: firstAdmin.email, role: firstAdmin.role }, response);
  response.status(201).json({ user: firstAdmin });
}
