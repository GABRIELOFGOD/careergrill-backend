import path from "node:path";
import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { HttpError } from "../config.js";
import { database } from "../database.js";
import { deleteAsset, getAsset, uploadAsset } from "../services/storage.service.js";

const uuid = z.string().uuid();

async function resourceById(id: string) {
  const { data, error } = await database().from("resources").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new HttpError(500, "Could not load this resource.", "RESOURCE_READ_FAILED");
  if (!data) throw new HttpError(404, "Resource not found.", "RESOURCE_NOT_FOUND");
  return data;
}

export async function listPublicResourceAttachments(request: Request, response: Response): Promise<void> {
  const slug = z.string().min(1).max(180).parse(request.params.slug);
  const { data: resource, error: resourceError } = await database().from("resources")
    .select("id").eq("slug", slug).eq("status", "published").is("deleted_at", null).maybeSingle();
  if (resourceError) throw new HttpError(500, "Could not load this resource.", "RESOURCE_READ_FAILED");
  if (!resource) throw new HttpError(404, "Resource not found.", "RESOURCE_NOT_FOUND");
  const { data, error } = await database().from("resource_attachments")
    .select("id, filename, mimetype, size_bytes").eq("resource_id", resource.id).order("created_at");
  if (error) throw new HttpError(500, "Could not load resource downloads.", "RESOURCE_ATTACHMENT_READ_FAILED");
  response.json({ items: data ?? [] });
}

export async function downloadPublicResourceAttachment(request: Request, response: Response): Promise<void> {
  const slug = z.string().min(1).max(180).parse(request.params.slug);
  const id = uuid.parse(request.params.attachmentId);
  const { data, error } = await database().from("resource_attachments")
    .select("storage_provider, storage_key, filename, mimetype, size_bytes, resources!inner(slug, status, deleted_at)")
    .eq("id", id).eq("resources.slug", slug).eq("resources.status", "published").is("resources.deleted_at", null).maybeSingle();
  if (error) throw new HttpError(500, "Could not load this resource download.", "RESOURCE_ATTACHMENT_READ_FAILED");
  if (!data) throw new HttpError(404, "Resource download not found.", "RESOURCE_ATTACHMENT_NOT_FOUND");
  const file = await getAsset(data.storage_provider, data.storage_key, data.filename);
  const filename = path.basename(data.filename).replace(/[\r\n"]/g, "_");
  const fallbackFilename = filename.replace(/[^\x20-\x7e]/g, "_");
  response
    .set("Content-Type", data.mimetype)
    .set("Content-Length", String(file.byteLength))
    .set("Content-Disposition", `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(data.filename)}`)
    .set("X-Content-Type-Options", "nosniff")
    .set("Cache-Control", "private, no-store")
    .send(file);
}

export async function listAdminResourceAttachments(request: AuthRequest, response: Response): Promise<void> {
  const resource = await resourceById(uuid.parse(request.params.id));
  const { data, error } = await database().from("resource_attachments")
    .select("id, filename, mimetype, size_bytes").eq("resource_id", resource.id).order("created_at");
  if (error) throw new HttpError(500, "Could not load resource downloads.", "RESOURCE_ATTACHMENT_READ_FAILED");
  response.json({ items: data ?? [] });
}

export async function uploadResourceAttachment(request: AuthRequest, response: Response): Promise<void> {
  const resource = await resourceById(uuid.parse(request.params.id));
  const file = request.file;
  if (!file) throw new HttpError(400, "Choose a file to upload.", "FILE_REQUIRED");
  if (!file.size) throw new HttpError(422, "Choose a file that is not empty.", "FILE_EMPTY");
  const filename = path.basename(file.originalname).replace(/[\r\n]/g, "_").slice(0, 180);
  if (!filename) throw new HttpError(422, "The file needs a valid name.", "FILE_NAME_INVALID");
  const mimetype = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.mimetype) && file.mimetype.length <= 180
    ? file.mimetype
    : "application/octet-stream";
  const asset = await uploadAsset(file.buffer, filename, mimetype);
  const { data, error } = await database().from("resource_attachments").insert({
    resource_id: resource.id,
    storage_provider: asset.provider,
    storage_key: asset.key,
    filename,
    mimetype,
    size_bytes: file.size,
    uploaded_by: request.user!.id,
  }).select("id, filename, mimetype, size_bytes").single();
  if (error) {
    await deleteAsset(asset.provider, asset.key);
    throw new HttpError(500, "Could not save this resource download.", "RESOURCE_ATTACHMENT_CREATE_FAILED");
  }
  response.status(201).json({ item: data });
}

export async function deleteResourceAttachment(request: AuthRequest, response: Response): Promise<void> {
  const resource = await resourceById(uuid.parse(request.params.id));
  const attachmentId = uuid.parse(request.params.attachmentId);
  const { data, error } = await database().from("resource_attachments")
    .select("id, storage_provider, storage_key").eq("id", attachmentId).eq("resource_id", resource.id).maybeSingle();
  if (error) throw new HttpError(500, "Could not load this resource download.", "RESOURCE_ATTACHMENT_READ_FAILED");
  if (!data) throw new HttpError(404, "Resource download not found.", "RESOURCE_ATTACHMENT_NOT_FOUND");
  await deleteAsset(data.storage_provider, data.storage_key);
  const { error: deleteError } = await database().from("resource_attachments").delete().eq("id", data.id);
  if (deleteError) throw new HttpError(500, "Could not remove this resource download.", "RESOURCE_ATTACHMENT_DELETE_FAILED");
  response.status(204).end();
}
