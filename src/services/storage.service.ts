import path from "node:path";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";
import { database } from "../database.js";
import { config, decryptSecret, HttpError } from "../config.js";

interface StoredAsset {
  provider: "supabase" | "cloudinary";
  key: string;
}

async function setting(key: string): Promise<unknown> {
  const { data, error } = await database().from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new HttpError(500, "Could not read storage configuration.", "STORAGE_CONFIG_FAILED");
  return data?.value;
}

async function cloudinaryConfig(): Promise<{ cloud_name: string; api_key: string; api_secret: string }> {
  const stored = await setting("cloudinary_credentials");
  if (!stored || typeof stored !== "object") {
    throw new HttpError(503, "Cloudinary credentials are not configured.", "STORAGE_SETUP_REQUIRED");
  }
  const parsed = z.record(z.string(), z.string()).safeParse(stored);
  if (!parsed.success) {
    throw new HttpError(500, "Cloudinary settings are invalid.", "STORAGE_CONFIG_INVALID");
  }
  const secrets = parsed.data;
  if (!secrets.cloud_name || !secrets.api_key || !secrets.api_secret) {
    throw new HttpError(503, "Cloudinary credentials are incomplete.", "STORAGE_SETUP_REQUIRED");
  }
  return {
    cloud_name: decryptSecret(secrets.cloud_name),
    api_key: decryptSecret(secrets.api_key),
    api_secret: decryptSecret(secrets.api_secret),
  };
}

export async function uploadAsset(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<StoredAsset> {
  const provider = await setting("storage_provider");
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
  const objectKey = `${randomUUID()}-${safeName}`;
  if (provider === "cloudinary") {
    cloudinary.config(await cloudinaryConfig());
    const result = await new Promise<{ public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: "raw", type: "authenticated", folder: "careergrill/sources", public_id: objectKey },
        (error, uploaded) => {
          if (error) reject(error);
          else if (uploaded) resolve(uploaded);
          else reject(new Error("Cloudinary returned no upload result."));
        },
      ).end(buffer);
    });
    return { provider: "cloudinary", key: result.public_id };
  }

  const { error } = await database()
    .storage
    .from(config.SUPABASE_STORAGE_BUCKET)
    .upload(objectKey, buffer, { contentType: mimetype, upsert: false });
  if (error) {
    console.error("Supabase Storage upload failed:", error.message);
    throw new HttpError(502, "Supabase Storage could not store the file.", "STORAGE_UPLOAD_FAILED");
  }
  return { provider: "supabase", key: objectKey };
}

export async function uploadContentImage(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<StoredAsset> {
  const provider = await setting("storage_provider");
  const objectKey = `${randomUUID()}-${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100)}`;
  if (provider === "cloudinary") {
    cloudinary.config(await cloudinaryConfig());
    const result = await new Promise<{ public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: "image", type: "upload", folder: "careergrill/content", public_id: objectKey },
        (error, uploaded) => {
          if (error) reject(error);
          else if (uploaded) resolve(uploaded);
          else reject(new Error("Cloudinary returned no image result."));
        },
      ).end(buffer);
    });
    return { provider: "cloudinary", key: result.public_id };
  }

  const { error } = await database().storage.from(config.SUPABASE_STORAGE_BUCKET)
    .upload(`content-images/${objectKey}`, buffer, { contentType: mimetype, upsert: false });
  if (error) {
    console.error("Supabase Storage image upload failed:", error.message);
    throw new HttpError(502, "Supabase Storage could not store the image.", "STORAGE_UPLOAD_FAILED");
  }
  return { provider: "supabase", key: `content-images/${objectKey}` };
}

export async function getContentImage(provider: string, key: string): Promise<Buffer> {
  if (provider === "cloudinary") {
    const { cloud_name } = await cloudinaryConfig();
    const imageUrl = cloudinary.url(key, { cloud_name, secure: true, resource_type: "image", type: "upload" });
    const result = await fetch(imageUrl);
    if (!result.ok) throw new HttpError(502, "The stored image could not be loaded.", "STORAGE_READ_FAILED");
    return Buffer.from(await result.arrayBuffer());
  }
  if (provider !== "supabase") {
    throw new HttpError(500, "The stored image provider is invalid.", "STORAGE_PROVIDER_INVALID");
  }
  const { data, error } = await database().storage.from(config.SUPABASE_STORAGE_BUCKET).download(key);
  if (error || !data) throw new HttpError(502, "The stored image could not be loaded.", "STORAGE_READ_FAILED");
  return Buffer.from(await data.arrayBuffer());
}

export async function getAsset(provider: string, key: string, filename = key): Promise<Buffer> {
  if (provider === "cloudinary") {
    const { cloud_name, api_key, api_secret } = await cloudinaryConfig();
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
    const extension = path.extname(filename).slice(1) || path.extname(key).slice(1) || "bin";
    const publicId = path.extname(key) ? key.slice(0, -path.extname(key).length) : key;
    const url = cloudinary.utils.private_download_url(publicId, extension, {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const result = await fetch(url);
    if (!result.ok) throw new HttpError(502, "The stored file could not be loaded.", "STORAGE_READ_FAILED");
    return Buffer.from(await result.arrayBuffer());
  }
  if (provider !== "supabase") {
    throw new HttpError(500, "The stored file provider is invalid.", "STORAGE_PROVIDER_INVALID");
  }
  const { data, error } = await database().storage.from(config.SUPABASE_STORAGE_BUCKET).download(key);
  if (error || !data) throw new HttpError(502, "The stored file could not be loaded.", "STORAGE_READ_FAILED");
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteAsset(provider: string, key: string): Promise<void> {
  if (provider === "cloudinary") {
    cloudinary.config(await cloudinaryConfig());
    const result = await cloudinary.uploader.destroy(key, {
      resource_type: key.startsWith("careergrill/content/") ? "image" : "raw",
      type: key.startsWith("careergrill/content/") ? "upload" : "authenticated",
    });
    if (result.result !== "ok" && result.result !== "not found") {
      throw new HttpError(502, "Cloudinary could not delete the file.", "STORAGE_DELETE_FAILED");
    }
    return;
  }
  if (provider !== "supabase") {
    throw new HttpError(500, "The stored file provider is invalid.", "STORAGE_PROVIDER_INVALID");
  }
  const { error } = await database().storage.from(config.SUPABASE_STORAGE_BUCKET).remove([key]);
  if (error) throw new HttpError(502, `Supabase Storage delete failed: ${error.message}`, "STORAGE_DELETE_FAILED");
}
