import { z } from "zod";
import { database } from "../database.js";
import { HttpError } from "../config.js";

export async function readSetting(key: string): Promise<unknown> {
  const { data, error } = await database().from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new HttpError(500, "Could not load application settings.", "SETTINGS_READ_FAILED");
  return data?.value;
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const { error } = await database().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new HttpError(500, "Could not save application settings.", "SETTINGS_WRITE_FAILED");
}

export async function deleteSetting(key: string): Promise<void> {
  const { error } = await database().from("app_settings").delete().eq("key", key);
  if (error) throw new HttpError(500, "Could not remove application settings.", "SETTINGS_WRITE_FAILED");
}

export function readStringMap(value: unknown, label: string): Record<string, string> {
  if (value === undefined || value === null) return {};
  const parsed = z.record(z.string(), z.string()).safeParse(value);
  if (!parsed.success) throw new HttpError(500, `${label} settings are invalid.`, "SETTINGS_INVALID");
  return parsed.data;
}

export async function assertEmailVerified(userId: string): Promise<void> {
  const { data, error } = await database().from("users").select("email_verified_at").eq("id", userId).single();
  if (error) throw new HttpError(500, "Could not verify your account details.", "USER_READ_FAILED");
  if (!data.email_verified_at) {
    throw new HttpError(403, "Verify your email address before enabling expiry reminders.", "EMAIL_VERIFICATION_REQUIRED");
  }
}
