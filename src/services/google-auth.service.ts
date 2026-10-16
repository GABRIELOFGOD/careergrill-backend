import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { database } from "../database.js";
import { config, HttpError } from "../config.js";

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

export interface AuthenticatedGoogleUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_CALLBACK_URL);
}

function googleClient(): OAuth2Client {
  if (!isGoogleAuthConfigured()) {
    throw new HttpError(503, "Google sign-in is not configured.", "GOOGLE_AUTH_NOT_CONFIGURED");
  }
  return new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_CALLBACK_URL,
  );
}

export function getGoogleAuthorizationUrl(state: string, nonce: string): string {
  return googleClient().generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
    nonce,
  });
}

export async function verifyGoogleAuthorizationCode(code: string, nonce: string): Promise<GoogleIdentity> {
  const client = googleClient();
  const clientId = config.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new HttpError(503, "Google sign-in is not configured.", "GOOGLE_AUTH_NOT_CONFIGURED");
  }
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new HttpError(401, "Google did not return a verified identity.", "GOOGLE_IDENTITY_MISSING");
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified || !payload.nonce || !equalSecret(payload.nonce, nonce)) {
    throw new HttpError(401, "Google could not verify this account.", "GOOGLE_IDENTITY_INVALID");
  }
  const email = payload.email.trim().toLowerCase();
  const providerName = payload.name?.trim() || email.split("@")[0] || "Careergrill user";
  const name = (providerName.length < 2 ? `${providerName} User` : providerName).slice(0, 100);
  return {
    sub: payload.sub,
    email,
    name,
  };
}

export async function findOrCreateGoogleUser(identity: GoogleIdentity): Promise<AuthenticatedGoogleUser> {
  const db = database();
  const { data: linkedUser, error: linkedError } = await db.from("users")
    .select("id, name, email, role, google_sub")
    .eq("google_sub", identity.sub)
    .maybeSingle();
  if (linkedError) throw new HttpError(500, "Could not load your Google account.", "GOOGLE_ACCOUNT_READ_FAILED");

  if (linkedUser) {
    const { data, error } = await db.from("users")
      .update({
        email: identity.email,
        email_verified_at: new Date().toISOString(),
      })
      .eq("id", linkedUser.id)
      .select("id, email, role")
      .single();
    if (error) throw new HttpError(409, "This Google account could not be linked to its current email.", "GOOGLE_EMAIL_CONFLICT");
    return data as AuthenticatedGoogleUser;
  }

  const { data: emailUser, error: emailError } = await db.from("users")
    .select("id, email, role, google_sub, email_verified_at")
    .eq("email", identity.email)
    .maybeSingle();
  if (emailError) throw new HttpError(500, "Could not load your account.", "GOOGLE_ACCOUNT_READ_FAILED");

  if (emailUser) {
    if (emailUser.google_sub && emailUser.google_sub !== identity.sub) {
      throw new HttpError(409, "This email is already linked to a different Google account.", "GOOGLE_ACCOUNT_CONFLICT");
    }
    if (!emailUser.email_verified_at) {
      throw new HttpError(409, "Sign in with your password and verify this email before linking Google.", "GOOGLE_ACCOUNT_UNVERIFIED");
    }
    const { data, error } = await db.from("users")
      .update({
        google_sub: identity.sub,
        email_verified_at: new Date().toISOString(),
      })
      .eq("id", emailUser.id)
      .select("id, email, role")
      .single();
    if (error) throw new HttpError(409, "This Google account could not be linked to your existing account.", "GOOGLE_ACCOUNT_CONFLICT");
    return data as AuthenticatedGoogleUser;
  }

  const { data, error } = await db.from("users")
    .insert({
      name: identity.name,
      email: identity.email,
      password_hash: null,
      google_sub: identity.sub,
      email_verified_at: new Date().toISOString(),
      role: "user",
    })
    .select("id, email, role")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "This Google account is already linked to another user.", "GOOGLE_ACCOUNT_CONFLICT");
    }
    throw new HttpError(500, "Could not create your account.", "GOOGLE_ACCOUNT_CREATE_FAILED");
  }
  return data as AuthenticatedGoogleUser;
}
