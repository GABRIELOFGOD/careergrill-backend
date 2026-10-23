import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { contentInput, publicContentTypes, contentUpdate } from "../content.js";
import {
  createContent,
  deleteContent,
  getPublishedContent,
  listAdminContent,
  listPublishedContent,
  listPublishedSitemapContent,
  listPublishedTestimonials,
  listTrashedContent,
  restoreContent,
  updateContent,
} from "../services/content.service.js";

const testimonialsPerPage = 6;

export async function getPublishedContentList(request: Request, response: Response): Promise<void> {
  if (request.query.sitemap === "1") {
    response.json({ items: await listPublishedSitemapContent() });
    return;
  }
  const type = request.query.type ? z.enum(publicContentTypes).parse(request.query.type) : undefined;
  response.json({ items: await listPublishedContent(type) });
}

export async function getPublishedTestimonials(request: Request, response: Response): Promise<void> {
  const { page } = z.object({
    page: z.coerce.number().int().positive().max(10000).default(1),
  }).parse(request.query);
  response.json(await listPublishedTestimonials(page, testimonialsPerPage));
}

export async function postClientFeedback(request: Request, response: Response): Promise<void> {
  const input = z.object({
    name: z.string().trim().min(2).max(100),
    context: z.string().trim().max(100).default(""),
    feedback: z.string().trim().min(20).max(5000),
    consent: z.literal(true),
  }).parse(request.body);
  const nameParts = input.name.split(/\s+/);
  const initials = nameParts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  await createContent({
    type: "testimonial",
    title: `Feedback from ${input.name}`,
    slug: `client-feedback-${randomUUID()}`,
    excerpt: input.feedback.slice(0, 500),
    body: input.feedback,
    category: input.context,
    tags: [],
    status: "draft",
    expires_at: null,
    source_url: null,
    data: { author: input.name, attribution: input.context, initials },
  });
  response.status(201).json({ message: "Thank you. Your feedback has been submitted for review." });
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
