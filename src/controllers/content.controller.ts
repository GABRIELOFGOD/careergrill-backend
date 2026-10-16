import type { Request, Response } from "express";
import { z } from "zod";
import { contentInput, contentTypes, contentUpdate } from "../content.js";
import {
  createContent,
  deleteContent,
  getPublishedContent,
  listAdminContent,
  listPublishedContent,
  listTrashedContent,
  restoreContent,
  updateContent,
} from "../services/content.service.js";

export async function getPublishedContentList(request: Request, response: Response): Promise<void> {
  const type = request.query.type ? z.enum(contentTypes).parse(request.query.type) : undefined;
  response.json({ items: await listPublishedContent(type) });
}

export async function getPublishedContentBySlug(request: Request, response: Response): Promise<void> {
  response.json({ item: await getPublishedContent(z.string().min(1).max(180).parse(request.params.slug)) });
}

export async function getAdminContent(_request: Request, response: Response): Promise<void> {
  response.json({ items: await listAdminContent() });
}

export async function getAdminTrash(_request: Request, response: Response): Promise<void> {
  response.json({ items: await listTrashedContent() });
}

export async function postAdminContent(request: Request, response: Response): Promise<void> {
  response.status(201).json({ item: await createContent(contentInput.parse(request.body)) });
}

export async function patchAdminContent(request: Request, response: Response): Promise<void> {
  const id = z.string().uuid().parse(request.params.id);
  response.json({ item: await updateContent(id, contentUpdate.parse(request.body)) });
}

export async function deleteAdminContent(request: Request, response: Response): Promise<void> {
  await deleteContent(z.string().uuid().parse(request.params.id));
  response.status(204).end();
}

export async function restoreAdminContent(request: Request, response: Response): Promise<void> {
  response.json({ item: await restoreContent(z.string().uuid().parse(request.params.id)) });
}
