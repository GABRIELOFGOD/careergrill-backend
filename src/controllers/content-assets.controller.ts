import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { HttpError } from "../config.js";
import { database } from "../database.js";
import { deleteAsset, getContentImage, uploadContentImage } from "../services/storage.service.js";

function imageMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function uploadContentImageAsset(request: AuthRequest, response: Response): Promise<void> {
  const file = request.file;
  if (!file) throw new HttpError(400, "Choose an image to upload.", "FILE_REQUIRED");
  const mimetype = imageMimeType(file.buffer);
  if (!mimetype) throw new HttpError(415, "Use a PNG, JPEG, GIF or WebP image.", "IMAGE_TYPE_UNSUPPORTED");

  const asset = await uploadContentImage(file.buffer, file.originalname, mimetype);
  const { data, error } = await database().from("content_assets")
    .insert({
      storage_provider: asset.provider,
      storage_key: asset.key,
      filename: file.originalname.slice(0, 180),
      mimetype,
      size_bytes: file.size,
      uploaded_by: request.user!.id,
    })
    .select("id")
    .single();
  if (error) {
    await deleteAsset(asset.provider, asset.key);
    throw new HttpError(500, "Could not save the uploaded image.", "IMAGE_CREATE_FAILED");
  }
  response.status(201).json({ item: { id: data.id, url: `/api/content/assets/${data.id}` } });
}

export async function getContentImageAsset(request: Request, response: Response): Promise<void> {
  const id = z.string().uuid().parse(request.params.id);
  const { data, error } = await database().from("content_assets")
    .select("storage_provider, storage_key, mimetype").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "Could not load this image.", "IMAGE_READ_FAILED");
  if (!data) throw new HttpError(404, "Image not found.", "IMAGE_NOT_FOUND");

  const image = await getContentImage(data.storage_provider, data.storage_key);
  response
    .set("Content-Type", data.mimetype)
    .set("Content-Length", String(image.byteLength))
    .set("X-Content-Type-Options", "nosniff")
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .send(image);
}
