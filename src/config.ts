import crypto from "node:crypto";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => value === "" ? undefined : value, schema.optional());
const optionalUrl = optionalString(z.string().url());
const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]),
  FRONTEND_URL: optionalUrl.default("http://localhost:3000"),
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalString(z.string().min(1)),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("careergrill-private"),
  JWT_SECRET: optionalString(z.string().min(32)),
  APP_ENCRYPTION_KEY: optionalString(z.string().regex(/^[a-fA-F0-9]{64}$/)),
  ADMIN_BOOTSTRAP_TOKEN: optionalString(z.string().min(24)),
  SMTP_HOST: optionalString(z.string().min(1)),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString(z.string().min(1)),
  SMTP_PASSWORD: optionalString(z.string().min(1)),
  SMTP_FROM: optionalString(z.string().email()),
  GOOGLE_CLIENT_ID: optionalString(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: optionalString(z.string().min(1)),
  GOOGLE_CALLBACK_URL: optionalUrl,
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const config = parsed.data;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

export function encryptionKey(): Buffer {
  if (!config.APP_ENCRYPTION_KEY) {
    throw new HttpError(503, "Secret encryption is not configured.", "SETUP_REQUIRED");
  }
  return Buffer.from(config.APP_ENCRYPTION_KEY, "hex");
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string): string {
  const [ivHex, tagHex, encryptedHex] = value.split(".");
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new HttpError(500, "Stored integration secret is invalid.", "INVALID_SECRET");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
