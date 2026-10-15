import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { HttpError } from "../config.js";
import { database } from "../database.js";
import { contentTypes } from "../content.js";
import { getContentById, listContentByIds } from "../services/content.service.js";
import { assertEmailVerified } from "../services/settings.service.js";

export async function listSavedContent(request: AuthRequest, response: Response): Promise<void> {
  const { data, error } = await database().from("saved_content")
    .select("id, status, notes, reminder_enabled, created_at, content_id, content_type")
    .eq("user_id", request.user!.id)
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(500, "Could not load your saved workspace.", "SAVED_READ_FAILED");

  const rows = data ?? [];
  const resolved = await Promise.all(contentTypes.map(async (type) => {
    const ids = rows.filter((row) => row.content_type === type).map((row) => row.content_id);
    const items = await listContentByIds(type, ids);
    return items.map((item) => [item.id, item] as const);
  }));
  const contentById = new Map(resolved.flat());
  const items = rows.map((row) => {
    const content = contentById.get(row.content_id);
    if (!content) throw new HttpError(500, "A saved item could not be loaded.", "SAVED_CONTENT_MISSING");
    return { ...row, content_items: content };
  });
  response.json({ items });
}

export async function saveContent(request: AuthRequest, response: Response): Promise<void> {
  const input = z.object({
    content_id: z.string().uuid(),
    content_type: z.enum(contentTypes).optional(),
    reminder_enabled: z.boolean().default(true),
  }).parse(request.body);
  const content = await getContentById(input.content_id, input.content_type);
  if (!content || content.status !== "published") {
    throw new HttpError(404, "This listing is no longer available.", "CONTENT_NOT_FOUND");
  }
  if (input.reminder_enabled) await assertEmailVerified(request.user!.id);
  const { data, error } = await database().from("saved_content")
    .upsert({
      user_id: request.user!.id,
      content_id: input.content_id,
      content_type: content.type,
      reminder_enabled: input.reminder_enabled,
      expires_at: content.expires_at,
    }, { onConflict: "user_id,content_type,content_id" })
    .select("id, status, notes, reminder_enabled, created_at")
    .single();
  if (error) throw new HttpError(500, "Could not save this listing.", "SAVED_CREATE_FAILED");
  response.status(201).json({ item: data });
}

export async function updateSavedContent(request: AuthRequest, response: Response): Promise<void> {
  const id = z.string().uuid().parse(request.params.id);
  const input = z.object({
    status: z.enum(["saved", "preparing", "submitted"]).optional(),
    notes: z.string().max(4000).optional(),
    reminder_enabled: z.boolean().optional(),
  }).parse(request.body);
  if (input.reminder_enabled) await assertEmailVerified(request.user!.id);
  const { data, error } = await database().from("saved_content")
    .update(input).eq("id", id).eq("user_id", request.user!.id)
    .select("id, status, notes, reminder_enabled, created_at").maybeSingle();
  if (error) throw new HttpError(500, "Could not update your saved item.", "SAVED_UPDATE_FAILED");
  if (!data) throw new HttpError(404, "Saved item not found.", "SAVED_NOT_FOUND");
  response.json({ item: data });
}

export async function deleteSavedContent(request: AuthRequest, response: Response): Promise<void> {
  const id = z.string().uuid().parse(request.params.id);
  const { data, error } = await database().from("saved_content")
    .delete().eq("id", id).eq("user_id", request.user!.id).select("id").maybeSingle();
  if (error) throw new HttpError(500, "Could not remove this saved item.", "SAVED_DELETE_FAILED");
  if (!data) throw new HttpError(404, "Saved item not found.", "SAVED_NOT_FOUND");
  response.status(204).end();
}
